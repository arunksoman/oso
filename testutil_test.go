package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
)

// fakeS3 is a minimal in-memory, path-style S3 server covering the calls App makes
type fakeS3 struct {
	mu      sync.Mutex
	buckets map[string]map[string][]byte
	// meta holds object headers, keyed by "bucket/key"
	meta map[string]fakeMeta
	// noTagging makes the tagging API fail, like backends that lack it
	noTagging bool
	// pageCap limits list pages below the requested max-keys to force pagination
	pageCap int
	// deny makes every request fail with 403 AccessDenied
	deny bool
	// denyMethod fails only requests with this HTTP method
	denyMethod string
}

// fakeMeta is what HeadObject reports besides the body
type fakeMeta struct {
	contentType  string
	cacheControl string
	metadata     map[string]string
	tags         map[string]string
	// size overrides the reported content length when positive
	size int64
}

type fakeListEntry struct {
	name     string
	isPrefix bool
	size     int
}

func newFakeS3(t *testing.T) (*fakeS3, *httptest.Server) {
	t.Helper()
	f := &fakeS3{buckets: map[string]map[string][]byte{}, meta: map[string]fakeMeta{}}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return f, srv
}

func (f *fakeS3) put(bucket, key, body string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.buckets[bucket] == nil {
		f.buckets[bucket] = map[string][]byte{}
	}
	f.buckets[bucket][key] = []byte(body)
}

func (f *fakeS3) setMeta(bucket, key string, meta fakeMeta) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.meta[bucket+"/"+key] = meta
}

func (f *fakeS3) getMeta(bucket, key string) fakeMeta {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.meta[bucket+"/"+key]
}

func (f *fakeS3) hasBucket(bucket string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.buckets[bucket]
	return ok
}

// metaFromHeaders reads the content type and x-amz-meta-* headers of a request
func metaFromHeaders(r *http.Request) fakeMeta {
	meta := fakeMeta{
		contentType:  r.Header.Get("Content-Type"),
		cacheControl: r.Header.Get("Cache-Control"),
		metadata:     map[string]string{},
	}
	for name, values := range r.Header {
		if lower := strings.ToLower(name); strings.HasPrefix(lower, "x-amz-meta-") {
			meta.metadata[strings.TrimPrefix(lower, "x-amz-meta-")] = values[0]
		}
	}
	return meta
}

func (f *fakeS3) get(bucket, key string) (string, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	body, ok := f.buckets[bucket][key]
	return string(body), ok
}

func (f *fakeS3) keys(bucket string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	keys := make([]string, 0, len(f.buckets[bucket]))
	for k := range f.buckets[bucket] {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func (f *fakeS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()

	w.Header().Set("Content-Type", "application/xml")
	if f.deny || r.Method == f.denyMethod {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, `<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>`)
		return
	}

	bucket, key, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/")
	switch {
	case bucket == "":
		f.listBuckets(w)
	case key == "" && r.Method == http.MethodPut:
		if f.buckets[bucket] == nil {
			f.buckets[bucket] = map[string][]byte{}
		}
	case key == "" && r.Method == http.MethodDelete:
		if len(f.buckets[bucket]) > 0 {
			w.WriteHeader(http.StatusConflict)
			fmt.Fprint(w, `<Error><Code>BucketNotEmpty</Code><Message>The bucket you tried to delete is not empty</Message></Error>`)
			return
		}
		delete(f.buckets, bucket)
		w.WriteHeader(http.StatusNoContent)
	case key == "" && r.Method == http.MethodGet:
		f.listObjects(w, r, bucket)
	case r.Method == http.MethodHead:
		f.headObject(w, bucket, key)
	case r.Method == http.MethodGet && r.URL.Query().Has("tagging"):
		f.getTagging(w, bucket, key)
	case r.Method == http.MethodPut && r.Header.Get("x-amz-copy-source") != "":
		f.copyObject(w, r, bucket, key)
	case r.Method == http.MethodPut:
		body, _ := io.ReadAll(r.Body)
		if f.buckets[bucket] == nil {
			f.buckets[bucket] = map[string][]byte{}
		}
		f.buckets[bucket][key] = body
		f.meta[bucket+"/"+key] = metaFromHeaders(r)
	case r.Method == http.MethodGet:
		body, ok := f.buckets[bucket][key]
		if !ok {
			noSuchKey(w)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		_, _ = w.Write(body)
	case r.Method == http.MethodDelete:
		delete(f.buckets[bucket], key)
		delete(f.meta, bucket+"/"+key)
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func noSuchKey(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNotFound)
	fmt.Fprint(w, `<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>`)
}

func (f *fakeS3) headObject(w http.ResponseWriter, bucket, key string) {
	body, ok := f.buckets[bucket][key]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	meta := f.meta[bucket+"/"+key]
	size := int64(len(body))
	if meta.size > 0 {
		size = meta.size
	}
	contentType := meta.contentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("ETag", fmt.Sprintf(`"etag-%d"`, len(body)))
	w.Header().Set("Last-Modified", "Fri, 02 Jan 2026 03:04:05 GMT")
	if meta.cacheControl != "" {
		w.Header().Set("Cache-Control", meta.cacheControl)
	}
	for name, value := range meta.metadata {
		w.Header().Set("x-amz-meta-"+name, value)
	}
}

func (f *fakeS3) getTagging(w http.ResponseWriter, bucket, key string) {
	if f.noTagging {
		w.WriteHeader(http.StatusNotImplemented)
		fmt.Fprint(w, `<Error><Code>NotImplemented</Code><Message>Tagging is not supported</Message></Error>`)
		return
	}
	names := make([]string, 0)
	tags := f.meta[bucket+"/"+key].tags
	for name := range tags {
		names = append(names, name)
	}
	sort.Strings(names)
	fmt.Fprint(w, `<Tagging><TagSet>`)
	for _, name := range names {
		fmt.Fprintf(w, `<Tag><Key>%s</Key><Value>%s</Value></Tag>`, xmlEscape(name), xmlEscape(tags[name]))
	}
	fmt.Fprint(w, `</TagSet></Tagging>`)
}

func xmlEscape(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

func (f *fakeS3) listBuckets(w http.ResponseWriter) {
	names := make([]string, 0, len(f.buckets))
	for name := range f.buckets {
		names = append(names, name)
	}
	sort.Strings(names)
	fmt.Fprint(w, `<ListAllMyBucketsResult><Buckets>`)
	for _, name := range names {
		fmt.Fprintf(w, `<Bucket><Name>%s</Name><CreationDate>2026-01-02T03:04:05Z</CreationDate></Bucket>`, xmlEscape(name))
	}
	fmt.Fprint(w, `</Buckets></ListAllMyBucketsResult>`)
}

func (f *fakeS3) listObjects(w http.ResponseWriter, r *http.Request, bucket string) {
	q := r.URL.Query()
	prefix, delimiter := q.Get("prefix"), q.Get("delimiter")

	seen := map[string]bool{}
	entries := []fakeListEntry{}
	for key, body := range f.buckets[bucket] {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		if delimiter != "" {
			if i := strings.Index(key[len(prefix):], delimiter); i >= 0 {
				p := key[:len(prefix)+i+len(delimiter)]
				if !seen[p] {
					seen[p] = true
					entries = append(entries, fakeListEntry{name: p, isPrefix: true})
				}
				continue
			}
		}
		entries = append(entries, fakeListEntry{name: key, size: len(body)})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].name < entries[j].name })

	// Like real S3, the token marks a key position, so it survives deletes between pages
	start := 0
	if token := q.Get("continuation-token"); token != "" {
		start = sort.Search(len(entries), func(i int) bool { return entries[i].name > token })
	}
	limit, _ := strconv.Atoi(q.Get("max-keys"))
	if limit <= 0 {
		limit = 1000
	}
	if f.pageCap > 0 && f.pageCap < limit {
		limit = f.pageCap
	}
	end := min(start+limit, len(entries))

	fmt.Fprint(w, `<ListBucketResult>`)
	fmt.Fprintf(w, `<IsTruncated>%t</IsTruncated>`, end < len(entries))
	if end < len(entries) {
		fmt.Fprintf(w, `<NextContinuationToken>%s</NextContinuationToken>`, xmlEscape(entries[end-1].name))
	}
	for _, e := range entries[start:end] {
		if e.isPrefix {
			fmt.Fprintf(w, `<CommonPrefixes><Prefix>%s</Prefix></CommonPrefixes>`, xmlEscape(e.name))
			continue
		}
		fmt.Fprintf(w, `<Contents><Key>%s</Key><Size>%d</Size><LastModified>2026-01-02T03:04:05Z</LastModified><ETag>&quot;etag-%d&quot;</ETag></Contents>`,
			xmlEscape(e.name), e.size, e.size)
	}
	fmt.Fprint(w, `</ListBucketResult>`)
}

func (f *fakeS3) copyObject(w http.ResponseWriter, r *http.Request, bucket, key string) {
	source, err := url.PathUnescape(r.Header.Get("x-amz-copy-source"))
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	srcBucket, srcKey, _ := strings.Cut(strings.TrimPrefix(source, "/"), "/")
	body, ok := f.buckets[srcBucket][srcKey]
	if !ok {
		noSuchKey(w)
		return
	}
	if f.buckets[bucket] == nil {
		f.buckets[bucket] = map[string][]byte{}
	}
	f.buckets[bucket][key] = body
	// Like S3: REPLACE takes the headers of the request, COPY keeps those of the source
	source = srcBucket + "/" + srcKey
	if r.Header.Get("x-amz-metadata-directive") == "REPLACE" {
		meta := metaFromHeaders(r)
		meta.tags = f.meta[source].tags
		f.meta[bucket+"/"+key] = meta
	} else {
		f.meta[bucket+"/"+key] = f.meta[source]
	}
	fmt.Fprint(w, `<CopyObjectResult><ETag>&quot;copied&quot;</ETag></CopyObjectResult>`)
}

// isolateHome points the user home directory at a temp dir, so tests never
// touch the real ~/.oso, and clears the S3 environment overrides.
func isolateHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	for _, name := range []string{"S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_REGION"} {
		t.Setenv(name, "")
	}
	return home
}

// newConnectedApp returns an App connected to a fresh fake S3 server
func newConnectedApp(t *testing.T) (*App, *fakeS3) {
	t.Helper()
	isolateHome(t)
	fake, srv := newFakeS3(t)
	app := NewApp()
	cfg := &S3Config{Endpoint: srv.URL, AccessKey: "test", SecretKey: "testsecret", Region: "us-east-1"}
	if err := app.connectWithConfig(cfg); err != nil {
		t.Fatalf("connectWithConfig: %v", err)
	}
	return app, fake
}

// writeLegacyConfig writes the single-connection config.json of older versions
func writeLegacyConfig(t *testing.T, app *App, cfg S3Config) {
	t.Helper()
	if err := os.MkdirAll(app.configDir(), 0700); err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(app.configPath(), data, 0600); err != nil {
		t.Fatal(err)
	}
}

// writeLocal creates a file below dir; rel uses forward slashes
func writeLocal(t *testing.T, dir, rel, body string) {
	t.Helper()
	path := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
}
