package main

import (
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func objectKeys(objects []S3Object) []string {
	keys := make([]string, len(objects))
	for i, o := range objects {
		keys[i] = o.Key
	}
	return keys
}

func TestOperationsRequireConnection(t *testing.T) {
	app := NewApp()
	calls := map[string]func() error{
		"ListBuckets":     func() error { _, err := app.ListBuckets(); return err },
		"CreateBucket":    func() error { return app.CreateBucket("valid-name") },
		"ListObjects":     func() error { _, err := app.ListObjects("b", "", "", 10); return err },
		"SearchObjects":   func() error { _, err := app.SearchObjects("b", "", "q", 10); return err },
		"DeleteObject":    func() error { return app.DeleteObject("b", "k") },
		"DeleteObjects":   func() error { return app.DeleteObjects("b", []string{"k"}) },
		"DeleteFolder":    func() error { return app.DeleteFolder("b", "p/") },
		"CopyObject":      func() error { return app.CopyObject("b", "k", "b", "k2") },
		"MoveObject":      func() error { return app.MoveObject("b", "k", "b", "k2") },
		"CopyFolder":      func() error { return app.CopyFolder("b", "p/", "b", "q/") },
		"MoveFolder":      func() error { return app.MoveFolder("b", "p/", "b", "q/") },
		"DownloadObject":  func() error { return app.DownloadObject("b", "k", filepath.Join(t.TempDir(), "k")) },
		"GetPresignedURL": func() error { _, err := app.GetPresignedURL("b", "k", 60); return err },
		"CreateFolder":    func() error { return app.CreateFolder("b", "", "new") },
		"UploadFile":      func() error { return app.UploadFile("b", "", "missing.txt") },
		"DeleteBucket":    func() error { return app.DeleteBucket("b", true) },
		"GetProperties":   func() error { _, err := app.GetObjectProperties("b", "k"); return err },
		"SetProperties":   func() error { return app.UpdateObjectProperties("b", "k", "text/plain", nil) },
	}
	for name, call := range calls {
		err := call()
		if err == nil || !strings.Contains(err.Error(), "not connected to S3") {
			t.Errorf("%s: err = %v, want a not-connected error", name, err)
		}
	}
}

func TestListBuckets(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("beta", "x", "")
	fake.put("alpha", "x", "")

	buckets, err := app.ListBuckets()
	if err != nil {
		t.Fatalf("ListBuckets: %v", err)
	}

	want := []Bucket{
		{Name: "alpha", CreationDate: "2026-01-02T03:04:05Z"},
		{Name: "beta", CreationDate: "2026-01-02T03:04:05Z"},
	}
	if !reflect.DeepEqual(buckets, want) {
		t.Errorf("ListBuckets() = %+v, want %+v", buckets, want)
	}
}

func TestCreateBucketValidation(t *testing.T) {
	app, fake := newConnectedApp(t)

	invalid := map[string]string{
		"ab":                    "between 3 and 63",
		strings.Repeat("a", 64): "between 3 and 63",
		"My-Bucket":             "lowercase",
		"my_bucket":             "lowercase",
		"my bucket":             "lowercase",
		"-bucket":               "start and end",
		"bucket-":               "start and end",
		".bucket":               "start and end",
		"bucket.":               "start and end",
		"my..bucket":            "consecutive dots",
	}
	for name, wantMessage := range invalid {
		err := app.CreateBucket(name)
		if err == nil || !strings.Contains(err.Error(), wantMessage) {
			t.Errorf("CreateBucket(%q) err = %v, want message containing %q", name, err, wantMessage)
		}
	}
	if len(fake.buckets) != 0 {
		t.Errorf("invalid names reached the server: %v", fake.buckets)
	}
}

func TestCreateBucket(t *testing.T) {
	app, fake := newConnectedApp(t)

	for _, name := range []string{"abc", "my-bucket.v2", strings.Repeat("a", 63)} {
		if err := app.CreateBucket(name); err != nil {
			t.Errorf("CreateBucket(%q): %v", name, err)
		}
	}
	// Surrounding whitespace is trimmed before validation
	if err := app.CreateBucket("  padded  "); err != nil {
		t.Errorf("CreateBucket with whitespace: %v", err)
	}
	if _, ok := fake.buckets["padded"]; !ok {
		t.Error("expected bucket \"padded\" to be created")
	}
	if len(fake.buckets) != 4 {
		t.Errorf("got %d buckets, want 4", len(fake.buckets))
	}
}

func TestListObjects(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "docs/", "") // folder marker
	fake.put("b", "docs/readme.md", "hello")
	fake.put("b", "docs/images/logo.png", "png")
	fake.put("b", "docs/images/icon.png", "png")
	fake.put("b", "docs/archive/old.txt", "old")
	fake.put("b", "root.txt", "root")

	result, err := app.ListObjects("b", "docs/", "", 100)
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}

	want := []S3Object{
		{Key: "docs/archive/", Name: "archive", IsFolder: true},
		{Key: "docs/images/", Name: "images", IsFolder: true},
		{Key: "docs/readme.md", Name: "readme.md", Size: 5, LastModified: "2026-01-02T03:04:05Z", ETag: "etag-5"},
	}
	if !reflect.DeepEqual(result.Objects, want) {
		t.Errorf("Objects = %+v, want %+v", result.Objects, want)
	}
	if result.HasMore || result.NextContinuationToken != "" {
		t.Errorf("expected a single page, got HasMore=%v token=%q", result.HasMore, result.NextContinuationToken)
	}
}

func TestListObjectsAtBucketRoot(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "docs/readme.md", "hello")
	fake.put("b", "root.txt", "root")

	result, err := app.ListObjects("b", "", "", 100)
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}
	if got, want := objectKeys(result.Objects), []string{"docs/", "root.txt"}; !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}
}

func TestListObjectsEmptyIsNotNil(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "other/file.txt", "x")

	result, err := app.ListObjects("b", "empty/", "", 100)
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}
	// The frontend iterates the array; nil would serialize as JSON null
	if result.Objects == nil || len(result.Objects) != 0 {
		t.Errorf("Objects = %#v, want an empty non-nil slice", result.Objects)
	}
}

func TestListObjectsPagination(t *testing.T) {
	app, fake := newConnectedApp(t)
	for i := range 5 {
		fake.put("b", fmt.Sprintf("file-%d.txt", i), "x")
	}

	var keys []string
	token := ""
	pages := 0
	for {
		result, err := app.ListObjects("b", "", token, 2)
		if err != nil {
			t.Fatalf("ListObjects: %v", err)
		}
		if len(result.Objects) > 2 {
			t.Fatalf("page has %d objects, want at most 2", len(result.Objects))
		}
		keys = append(keys, objectKeys(result.Objects)...)
		pages++
		if !result.HasMore {
			break
		}
		if result.NextContinuationToken == "" {
			t.Fatal("HasMore without a continuation token")
		}
		token = result.NextContinuationToken
	}

	want := []string{"file-0.txt", "file-1.txt", "file-2.txt", "file-3.txt", "file-4.txt"}
	if !reflect.DeepEqual(keys, want) {
		t.Errorf("keys = %v, want %v", keys, want)
	}
	if pages != 3 {
		t.Errorf("pages = %d, want 3", pages)
	}
}

func TestSearchObjects(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.pageCap = 2 // force SearchObjects to follow continuation tokens
	fake.put("b", "data/Report-2025.pdf", "a")
	fake.put("b", "data/notes.txt", "b")
	fake.put("b", "data/report-final.docx", "c")
	fake.put("b", "data/reports/q1.csv", "d")
	fake.put("b", "data/zzz/report-nested.txt", "e")
	fake.put("b", "other/report.txt", "f")

	results, err := app.SearchObjects("b", "data/", "  REPORT ", 100)
	if err != nil {
		t.Fatalf("SearchObjects: %v", err)
	}

	// Folders first, case-insensitive, immediate children only
	want := []string{"data/reports/", "data/Report-2025.pdf", "data/report-final.docx"}
	if got := objectKeys(results); !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}
	if !results[0].IsFolder || results[0].Name != "reports" {
		t.Errorf("first result = %+v, want folder \"reports\"", results[0])
	}
}

func TestSearchObjectsEmptyQuery(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "file.txt", "x")

	results, err := app.SearchObjects("b", "", "   ", 100)
	if err != nil {
		t.Fatalf("SearchObjects: %v", err)
	}
	if results == nil || len(results) != 0 {
		t.Errorf("results = %#v, want an empty non-nil slice", results)
	}
}

func TestSearchObjectsCapsResults(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.pageCap = 3
	for i := range 10 {
		fake.put("b", fmt.Sprintf("match-%d.txt", i), "x")
	}

	results, err := app.SearchObjects("b", "", "match", 4)
	if err != nil {
		t.Fatalf("SearchObjects: %v", err)
	}
	if len(results) != 4 {
		t.Errorf("got %d results, want 4", len(results))
	}
}

func TestDeleteObjects(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "a.txt", "a")
	fake.put("b", "b.txt", "b")
	fake.put("b", "c.txt", "c")

	if err := app.DeleteObjects("b", []string{"a.txt", "c.txt"}); err != nil {
		t.Fatalf("DeleteObjects: %v", err)
	}
	if got, want := fake.keys("b"), []string{"b.txt"}; !reflect.DeepEqual(got, want) {
		t.Errorf("remaining keys = %v, want %v", got, want)
	}
}

func TestDeleteFolderAcrossPages(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.pageCap = 2
	for i := range 5 {
		fake.put("b", fmt.Sprintf("trash/sub/file-%d.txt", i), "x")
	}
	fake.put("b", "trash-not/keep.txt", "x")
	fake.put("b", "keep.txt", "x")

	if err := app.DeleteFolder("b", "trash/"); err != nil {
		t.Fatalf("DeleteFolder: %v", err)
	}
	if got, want := fake.keys("b"), []string{"keep.txt", "trash-not/keep.txt"}; !reflect.DeepEqual(got, want) {
		t.Errorf("remaining keys = %v, want %v", got, want)
	}
}

func TestCopyObjectEscapesSourceKey(t *testing.T) {
	app, fake := newConnectedApp(t)
	key := "my folder/résumé #1 (final)+v2.pdf"
	fake.put("src", key, "content")

	if err := app.CopyObject("src", key, "dst", "copy.pdf"); err != nil {
		t.Fatalf("CopyObject: %v", err)
	}
	if body, ok := fake.get("dst", "copy.pdf"); !ok || body != "content" {
		t.Errorf("copied body = %q (found %v), want \"content\"", body, ok)
	}
	if _, ok := fake.get("src", key); !ok {
		t.Error("copy must keep the source object")
	}
}

func TestMoveObject(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "old.txt", "content")

	if err := app.MoveObject("b", "old.txt", "b", "new.txt"); err != nil {
		t.Fatalf("MoveObject: %v", err)
	}
	if got, want := fake.keys("b"), []string{"new.txt"}; !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}
}

func TestMoveObjectKeepsSourceWhenCopyFails(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "keep.txt", "content")

	if err := app.MoveObject("b", "missing.txt", "b", "new.txt"); err == nil {
		t.Fatal("expected an error for a missing source")
	}
	if got, want := fake.keys("b"), []string{"keep.txt"}; !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}
}

func TestCopyFolderAcrossPages(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.pageCap = 2
	fake.put("b", "src/a.txt", "a")
	fake.put("b", "src/sub/b.txt", "b")
	fake.put("b", "src/sub/deep/c.txt", "c")

	if err := app.CopyFolder("b", "src/", "other", "backup/src/"); err != nil {
		t.Fatalf("CopyFolder: %v", err)
	}

	want := []string{"backup/src/a.txt", "backup/src/sub/b.txt", "backup/src/sub/deep/c.txt"}
	if got := fake.keys("other"); !reflect.DeepEqual(got, want) {
		t.Errorf("copied keys = %v, want %v", got, want)
	}
	if len(fake.keys("b")) != 3 {
		t.Error("copy must keep the source objects")
	}
}

func TestMoveFolder(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "src/a.txt", "a")
	fake.put("b", "src/sub/b.txt", "b")
	fake.put("b", "unrelated.txt", "u")

	if err := app.MoveFolder("b", "src/", "b", "dst/"); err != nil {
		t.Fatalf("MoveFolder: %v", err)
	}
	want := []string{"dst/a.txt", "dst/sub/b.txt", "unrelated.txt"}
	if got := fake.keys("b"); !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}
}

func TestDownloadObject(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "docs/readme.md", "hello world")
	dest := filepath.Join(t.TempDir(), "nested", "dir", "readme.md")

	if err := app.DownloadObject("b", "docs/readme.md", dest); err != nil {
		t.Fatalf("DownloadObject: %v", err)
	}
	data, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "hello world" {
		t.Errorf("downloaded %q, want \"hello world\"", data)
	}
}

func TestDownloadObjectMissingKeyCreatesNoFile(t *testing.T) {
	app, _ := newConnectedApp(t)
	dest := filepath.Join(t.TempDir(), "missing.txt")

	if err := app.DownloadObject("b", "missing.txt", dest); err == nil {
		t.Fatal("expected an error for a missing key")
	}
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Error("a failed download must not leave a file behind")
	}
}

func TestGetPresignedURL(t *testing.T) {
	app, _ := newConnectedApp(t)

	raw, err := app.GetPresignedURL("my-bucket", "docs/my file.pdf", 900)
	if err != nil {
		t.Fatalf("GetPresignedURL: %v", err)
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if u.Path != "/my-bucket/docs/my file.pdf" {
		t.Errorf("path = %q, want path-style /my-bucket/docs/my file.pdf", u.Path)
	}
	if got := u.Query().Get("X-Amz-Expires"); got != "900" {
		t.Errorf("X-Amz-Expires = %q, want 900", got)
	}
	if u.Query().Get("X-Amz-Signature") == "" {
		t.Error("presigned URL has no signature")
	}
}

func TestCreateFolder(t *testing.T) {
	app, fake := newConnectedApp(t)

	if err := app.CreateFolder("b", "docs/", "new"); err != nil {
		t.Fatalf("CreateFolder: %v", err)
	}
	if body, ok := fake.get("b", "docs/new/"); !ok || body != "" {
		t.Errorf("folder marker = %q (found %v), want an empty object", body, ok)
	}
}

func TestUploadFile(t *testing.T) {
	app, fake := newConnectedApp(t)
	local := filepath.Join(t.TempDir(), "report.txt")
	if err := os.WriteFile(local, []byte("report body"), 0600); err != nil {
		t.Fatal(err)
	}

	if err := app.UploadFile("b", "docs/", local); err != nil {
		t.Fatalf("UploadFile: %v", err)
	}
	if body, ok := fake.get("b", "docs/report.txt"); !ok || body != "report body" {
		t.Errorf("uploaded body = %q (found %v), want \"report body\"", body, ok)
	}
}

func TestUploadFileMissingLocalFile(t *testing.T) {
	app, fake := newConnectedApp(t)

	if err := app.UploadFile("b", "", filepath.Join(t.TempDir(), "missing.txt")); err == nil {
		t.Fatal("expected an error for a missing local file")
	}
	if len(fake.keys("b")) != 0 {
		t.Error("nothing should have been uploaded")
	}
}

func TestUploadFolderPreservesStructure(t *testing.T) {
	app, fake := newConnectedApp(t)
	root := filepath.Join(t.TempDir(), "photos")
	files := map[string]string{
		"a.jpg":             "a",
		"2025/b.jpg":        "b",
		"2025/summer/c.jpg": "c",
	}
	for rel, body := range files {
		path := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}

	if err := app.UploadFile("b", "backup/", root); err != nil {
		t.Fatalf("UploadFile: %v", err)
	}

	want := []string{"backup/photos/2025/b.jpg", "backup/photos/2025/summer/c.jpg", "backup/photos/a.jpg"}
	if got := fake.keys("b"); !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}
	if body, _ := fake.get("b", "backup/photos/2025/summer/c.jpg"); body != "c" {
		t.Errorf("nested body = %q, want \"c\"", body)
	}
}

func TestUploadFiles(t *testing.T) {
	app, fake := newConnectedApp(t)
	dir := t.TempDir()
	var paths []string
	for _, name := range []string{"one.txt", "two.txt"} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte(name), 0600); err != nil {
			t.Fatal(err)
		}
		paths = append(paths, path)
	}

	if err := app.UploadFiles("b", "", paths); err != nil {
		t.Fatalf("UploadFiles: %v", err)
	}
	if got, want := fake.keys("b"), []string{"one.txt", "two.txt"}; !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}

	// The first failure stops the batch
	err := app.UploadFiles("b", "later/", []string{filepath.Join(dir, "missing.txt"), paths[0]})
	if err == nil {
		t.Fatal("expected an error for a missing file")
	}
	if len(fake.keys("b")) != 2 {
		t.Error("files after a failed upload must not be uploaded")
	}
}

func TestProgressReader(t *testing.T) {
	pr := &progressReader{r: strings.NewReader("0123456789"), total: 10, key: "k"}

	buf := make([]byte, 4)
	n, err := pr.Read(buf)
	if err != nil || n != 4 || pr.read != 4 {
		t.Fatalf("Read: n=%d read=%d err=%v, want n=4 read=4", n, pr.read, err)
	}

	// The SDK rewinds the body to sign or retry; progress must follow
	if _, err := pr.Seek(0, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	if pr.read != 0 {
		t.Errorf("read after rewind = %d, want 0", pr.read)
	}

	data, err := io.ReadAll(pr)
	if err != nil || string(data) != "0123456789" {
		t.Fatalf("ReadAll = %q, %v", data, err)
	}
	if pr.read != 10 {
		t.Errorf("read = %d, want 10", pr.read)
	}
}
