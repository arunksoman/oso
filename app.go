package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// version is set at build time via -ldflags "-X main.version=x.y.z"
var version = "dev"

// App struct
type App struct {
	ctx           context.Context
	s3Client      *s3.Client
	presignClient *s3.PresignClient
	appConfig     *S3Config
}

// S3Config holds S3 connection configuration
type S3Config struct {
	Endpoint  string `json:"endpoint"`
	AccessKey string `json:"accessKey"`
	SecretKey string `json:"secretKey"`
	Region    string `json:"region"`
}

// AppSettings holds application settings
type AppSettings struct {
	DefaultDownloadPath string `json:"defaultDownloadPath"`
	AskBeforeDownload   bool   `json:"askBeforeDownload"`
	ShowFileDetails     bool   `json:"showFileDetails"`
}

// Bucket represents an S3 bucket
type Bucket struct {
	Name         string `json:"name"`
	CreationDate string `json:"creationDate"`
}

// S3Object represents a file or folder in S3
type S3Object struct {
	Key          string `json:"key"`
	Name         string `json:"name"`
	Size         int64  `json:"size"`
	LastModified string `json:"lastModified"`
	IsFolder     bool   `json:"isFolder"`
	ETag         string `json:"etag"`
}

// ListObjectsResult holds paginated listing results
type ListObjectsResult struct {
	Objects               []S3Object `json:"objects"`
	NextContinuationToken string     `json:"nextContinuationToken"`
	HasMore               bool       `json:"hasMore"`
}

// progressReader wraps an io.ReadSeeker to emit upload progress events
type progressReader struct {
	r     io.ReadSeeker
	total int64
	read  int64
	ctx   context.Context
	key   string
}

func (pr *progressReader) Read(p []byte) (n int, err error) {
	n, err = pr.r.Read(p)
	pr.read += int64(n)
	if pr.total > 0 {
		progress := float64(pr.read) / float64(pr.total) * 100
		runtime.EventsEmit(pr.ctx, "upload:progress", map[string]interface{}{
			"key":      pr.key,
			"progress": progress,
		})
	}
	return
}

func (pr *progressReader) Seek(offset int64, whence int) (int64, error) {
	n, err := pr.r.Seek(offset, whence)
	if err == nil {
		pr.read = n
	}
	return n, err
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// GetVersion returns the app version
func (a *App) GetVersion() string {
	if version != "dev" {
		return version
	}
	// Fallback: read from version.json for dev mode
	data, err := os.ReadFile("version.json")
	if err != nil {
		return version
	}
	var v struct {
		Version string `json:"version"`
	}
	if json.Unmarshal(data, &v) == nil && v.Version != "" {
		return v.Version
	}
	return version
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.loadConfig()
}

func (a *App) configDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".oso")
}

func (a *App) configPath() string {
	return filepath.Join(a.configDir(), "config.json")
}

func (a *App) settingsPath() string {
	return filepath.Join(a.configDir(), "settings.json")
}

func (a *App) loadConfig() {
	// Check environment variables first
	endpoint := os.Getenv("S3_ENDPOINT")
	accessKey := os.Getenv("S3_ACCESS_KEY")
	secretKey := os.Getenv("S3_SECRET_KEY")
	region := os.Getenv("S3_REGION")

	if endpoint != "" && accessKey != "" && secretKey != "" {
		if region == "" {
			region = "us-east-1"
		}
		cfg := &S3Config{
			Endpoint:  endpoint,
			AccessKey: accessKey,
			SecretKey: secretKey,
			Region:    region,
		}
		_ = a.connectWithConfig(cfg)
		return
	}

	// Fall back to saved config
	data, err := os.ReadFile(a.configPath())
	if err != nil {
		return
	}
	var cfg S3Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return
	}
	a.appConfig = &cfg
	_ = a.connectWithConfig(&cfg)
}

func (a *App) connectWithConfig(cfg *S3Config) error {
	if cfg.Region == "" {
		cfg.Region = "us-east-1"
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.TODO(),
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		),
	)
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
		o.UsePathStyle = true
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})

	a.s3Client = client
	a.presignClient = s3.NewPresignClient(client)
	a.appConfig = cfg
	return nil
}

// GetSavedConfig returns the saved S3 configuration
func (a *App) GetSavedConfig() *S3Config {
	return a.appConfig
}

// Connect connects to S3 with the given configuration and tests it
func (a *App) Connect(cfg S3Config) error {
	if err := a.connectWithConfig(&cfg); err != nil {
		return err
	}

	// Test the connection
	_, err := a.s3Client.ListBuckets(context.TODO(), &s3.ListBucketsInput{})
	if err != nil {
		a.s3Client = nil
		a.presignClient = nil
		a.appConfig = nil
		return fmt.Errorf("connection failed: %w", err)
	}

	return a.SaveConfig(cfg)
}

// SaveConfig persists the S3 config to disk
func (a *App) SaveConfig(cfg S3Config) error {
	if err := os.MkdirAll(a.configDir(), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath(), data, 0600)
}

// Disconnect clears the active S3 connection
func (a *App) Disconnect() {
	a.s3Client = nil
	a.presignClient = nil
}

// IsConnected returns true if currently connected to S3
func (a *App) IsConnected() bool {
	return a.s3Client != nil
}

// GetSettings returns application settings (with defaults)
func (a *App) GetSettings() AppSettings {
	data, err := os.ReadFile(a.settingsPath())
	if err != nil {
		home, _ := os.UserHomeDir()
		return AppSettings{
			DefaultDownloadPath: filepath.Join(home, "Downloads"),
			AskBeforeDownload:   true,
			ShowFileDetails:     true,
		}
	}
	var settings AppSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		home, _ := os.UserHomeDir()
		return AppSettings{
			DefaultDownloadPath: filepath.Join(home, "Downloads"),
			AskBeforeDownload:   true,
			ShowFileDetails:     true,
		}
	}
	return settings
}

// SaveSettings persists application settings
func (a *App) SaveSettings(settings AppSettings) error {
	if err := os.MkdirAll(a.configDir(), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.settingsPath(), data, 0600)
}

// ListBuckets returns all S3 buckets
func (a *App) ListBuckets() ([]Bucket, error) {
	if a.s3Client == nil {
		return nil, fmt.Errorf("not connected to S3")
	}

	result, err := a.s3Client.ListBuckets(context.TODO(), &s3.ListBucketsInput{})
	if err != nil {
		return nil, err
	}

	buckets := make([]Bucket, 0, len(result.Buckets))
	for _, b := range result.Buckets {
		bucket := Bucket{Name: aws.ToString(b.Name)}
		if b.CreationDate != nil {
			bucket.CreationDate = b.CreationDate.Format(time.RFC3339)
		}
		buckets = append(buckets, bucket)
	}
	return buckets, nil
}

// CreateBucket creates a new S3 bucket after validating the name
func (a *App) CreateBucket(name string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}

	// Validate bucket name (S3 naming rules)
	name = strings.TrimSpace(name)
	if len(name) < 3 || len(name) > 63 {
		return fmt.Errorf("bucket name must be between 3 and 63 characters")
	}
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.') {
			return fmt.Errorf("bucket name can only contain lowercase letters, numbers, hyphens, and dots")
		}
	}
	if name[0] == '-' || name[0] == '.' || name[len(name)-1] == '-' || name[len(name)-1] == '.' {
		return fmt.Errorf("bucket name must start and end with a letter or number")
	}
	if strings.Contains(name, "..") {
		return fmt.Errorf("bucket name must not contain consecutive dots")
	}

	_, err := a.s3Client.CreateBucket(context.TODO(), &s3.CreateBucketInput{
		Bucket: aws.String(name),
	})
	if err != nil {
		return fmt.Errorf("failed to create bucket: %w", err)
	}
	return nil
}

// ListObjects lists objects in a bucket with prefix-based filtering and pagination
func (a *App) ListObjects(bucket, prefix, continuationToken string, maxKeys int32) (*ListObjectsResult, error) {
	if a.s3Client == nil {
		return nil, fmt.Errorf("not connected to S3")
	}
	if maxKeys <= 0 {
		maxKeys = 100
	}

	input := &s3.ListObjectsV2Input{
		Bucket:    aws.String(bucket),
		Delimiter: aws.String("/"),
		MaxKeys:   aws.Int32(maxKeys),
	}
	if prefix != "" {
		input.Prefix = aws.String(prefix)
	}
	if continuationToken != "" {
		input.ContinuationToken = aws.String(continuationToken)
	}

	result, err := a.s3Client.ListObjectsV2(context.TODO(), input)
	if err != nil {
		return nil, err
	}

	objects := make([]S3Object, 0)

	// Folders first (common prefixes)
	for _, cp := range result.CommonPrefixes {
		p := aws.ToString(cp.Prefix)
		name := strings.TrimSuffix(p, "/")
		if idx := strings.LastIndex(name, "/"); idx >= 0 {
			name = name[idx+1:]
		}
		objects = append(objects, S3Object{
			Key:      p,
			Name:     name,
			IsFolder: true,
		})
	}

	// Then files
	for _, obj := range result.Contents {
		key := aws.ToString(obj.Key)
		if key == prefix {
			continue // skip folder marker itself
		}
		name := key
		if idx := strings.LastIndex(key, "/"); idx >= 0 {
			name = key[idx+1:]
		}
		if name == "" {
			continue
		}
		o := S3Object{
			Key:      key,
			Name:     name,
			Size:     aws.ToInt64(obj.Size),
			IsFolder: false,
		}
		if obj.LastModified != nil {
			o.LastModified = obj.LastModified.Format(time.RFC3339)
		}
		if obj.ETag != nil {
			o.ETag = strings.Trim(aws.ToString(obj.ETag), "\"")
		}
		objects = append(objects, o)
	}

	nextToken := ""
	if result.NextContinuationToken != nil {
		nextToken = aws.ToString(result.NextContinuationToken)
	}

	return &ListObjectsResult{
		Objects:               objects,
		NextContinuationToken: nextToken,
		HasMore:               aws.ToBool(result.IsTruncated),
	}, nil
}

// DeleteObject deletes a single S3 object
func (a *App) DeleteObject(bucket, key string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	_, err := a.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}

// DeleteObjects deletes multiple S3 objects one by one (compatible with all S3 backends)
func (a *App) DeleteObjects(bucket string, keys []string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	for _, k := range keys {
		if err := a.DeleteObject(bucket, k); err != nil {
			return err
		}
	}
	return nil
}

// DeleteFolder recursively deletes all objects under a prefix
func (a *App) DeleteFolder(bucket, prefix string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	var continuationToken *string
	for {
		input := &s3.ListObjectsV2Input{
			Bucket: aws.String(bucket),
			Prefix: aws.String(prefix),
		}
		if continuationToken != nil {
			input.ContinuationToken = continuationToken
		}
		result, err := a.s3Client.ListObjectsV2(context.TODO(), input)
		if err != nil {
			return err
		}
		if len(result.Contents) > 0 {
			keys := make([]string, len(result.Contents))
			for i, obj := range result.Contents {
				keys[i] = aws.ToString(obj.Key)
			}
			if err := a.DeleteObjects(bucket, keys); err != nil {
				return err
			}
		}
		if !aws.ToBool(result.IsTruncated) {
			break
		}
		continuationToken = result.NextContinuationToken
	}
	return nil
}

// CopyObject copies an object from src to dst
func (a *App) CopyObject(srcBucket, srcKey, dstBucket, dstKey string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	// URL-encode each segment of the key for S3-compatible backends
	parts := strings.Split(srcKey, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	copySource := fmt.Sprintf("%s/%s", srcBucket, strings.Join(parts, "/"))
	_, err := a.s3Client.CopyObject(context.TODO(), &s3.CopyObjectInput{
		Bucket:     aws.String(dstBucket),
		Key:        aws.String(dstKey),
		CopySource: aws.String(copySource),
	})
	return err
}

// MoveObject moves an object (copy + delete)
func (a *App) MoveObject(srcBucket, srcKey, dstBucket, dstKey string) error {
	if err := a.CopyObject(srcBucket, srcKey, dstBucket, dstKey); err != nil {
		return err
	}
	return a.DeleteObject(srcBucket, srcKey)
}

// CopyFolder recursively copies all objects under a prefix to a new destination
func (a *App) CopyFolder(srcBucket, srcPrefix, dstBucket, dstPrefix string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	var continuationToken *string
	for {
		input := &s3.ListObjectsV2Input{
			Bucket: aws.String(srcBucket),
			Prefix: aws.String(srcPrefix),
		}
		if continuationToken != nil {
			input.ContinuationToken = continuationToken
		}
		result, err := a.s3Client.ListObjectsV2(context.TODO(), input)
		if err != nil {
			return err
		}
		for _, obj := range result.Contents {
			srcKey := aws.ToString(obj.Key)
			// Replace the source prefix with the destination prefix
			relKey := strings.TrimPrefix(srcKey, srcPrefix)
			dstKey := dstPrefix + relKey
			if err := a.CopyObject(srcBucket, srcKey, dstBucket, dstKey); err != nil {
				return fmt.Errorf("failed to copy %s: %w", srcKey, err)
			}
		}
		if !aws.ToBool(result.IsTruncated) {
			break
		}
		continuationToken = result.NextContinuationToken
	}
	return nil
}

// MoveFolder recursively moves all objects under a prefix (copy + delete)
func (a *App) MoveFolder(srcBucket, srcPrefix, dstBucket, dstPrefix string) error {
	if err := a.CopyFolder(srcBucket, srcPrefix, dstBucket, dstPrefix); err != nil {
		return err
	}
	return a.DeleteFolder(srcBucket, srcPrefix)
}

// DownloadObject downloads an S3 object to a local path
func (a *App) DownloadObject(bucket, key, destPath string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	result, err := a.s3Client.GetObject(context.TODO(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return err
	}
	defer result.Body.Close()

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return err
	}
	f, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, result.Body)
	return err
}

// UploadFile uploads a local file to S3, emitting progress events
func (a *App) UploadFile(bucket, prefix, localPath string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	fi, err := os.Stat(localPath)
	if err != nil {
		return err
	}
	f, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer f.Close()

	fileName := filepath.Base(localPath)
	key := prefix + fileName

	pr := &progressReader{
		r:     f,
		total: fi.Size(),
		ctx:   a.ctx,
		key:   key,
	}

	_, err = a.s3Client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket:        aws.String(bucket),
		Key:           aws.String(key),
		Body:          pr,
		ContentLength: aws.Int64(fi.Size()),
	})
	if err != nil {
		runtime.EventsEmit(a.ctx, "upload:error", map[string]interface{}{
			"key": key, "error": err.Error(),
		})
		return err
	}
	runtime.EventsEmit(a.ctx, "upload:done", map[string]interface{}{"key": key})
	return nil
}

// UploadFiles uploads multiple local files sequentially
func (a *App) UploadFiles(bucket, prefix string, localPaths []string) error {
	for _, path := range localPaths {
		if err := a.UploadFile(bucket, prefix, path); err != nil {
			return err
		}
	}
	return nil
}

// GetPresignedURL generates a presigned download URL for an S3 object
func (a *App) GetPresignedURL(bucket, key string, expirySeconds int) (string, error) {
	if a.presignClient == nil {
		return "", fmt.Errorf("not connected to S3")
	}
	result, err := a.presignClient.PresignGetObject(context.TODO(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = time.Duration(expirySeconds) * time.Second
	})
	if err != nil {
		return "", err
	}
	return result.URL, nil
}

// CreateFolder creates an S3 folder marker
func (a *App) CreateFolder(bucket, prefix, folderName string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	key := prefix + folderName + "/"
	_, err := a.s3Client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}

// OpenFileDialog opens a single-file picker dialog
func (a *App) OpenFileDialog() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select File to Upload",
	})
}

// OpenMultipleFilesDialog opens a multi-file picker dialog
func (a *App) OpenMultipleFilesDialog() ([]string, error) {
	return runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Files to Upload",
	})
}

// OpenDirectoryDialog opens a folder-picker dialog
func (a *App) OpenDirectoryDialog() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Download Location",
	})
}

// SaveFileDialog opens a save-file dialog
func (a *App) SaveFileDialog(defaultName string) (string, error) {
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save File As",
		DefaultFilename: defaultName,
	})
}

// GetDownloadsFolder returns the system Downloads folder path
func (a *App) GetDownloadsFolder() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Downloads")
}
