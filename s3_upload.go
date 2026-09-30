package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Upload event names emitted to the frontend
const (
	EventUploadFolderStart = "upload:folder:start"
	EventUploadProgress    = "upload:progress"
	EventUploadDone        = "upload:done"
	EventUploadError       = "upload:error"
)

// UploadFolderStartEvent announces how many files a folder upload contains
type UploadFolderStartEvent struct {
	Total int `json:"total"`
}

// UploadProgressEvent reports per-file upload progress (0-100)
type UploadProgressEvent struct {
	Key      string  `json:"key"`
	Progress float64 `json:"progress"`
}

// UploadDoneEvent reports a finished file upload
type UploadDoneEvent struct {
	Key string `json:"key"`
}

// UploadErrorEvent reports a failed file upload
type UploadErrorEvent struct {
	Key   string `json:"key"`
	Error string `json:"error"`
}

// emit sends an event to the frontend
func emit(name string, data any) {
	if app := application.Get(); app != nil {
		app.Event.Emit(name, data)
	}
}

// progressReader wraps an io.ReadSeeker to emit upload progress events
type progressReader struct {
	r     io.ReadSeeker
	total int64
	read  int64
	key   string
}

func (pr *progressReader) Read(p []byte) (n int, err error) {
	n, err = pr.r.Read(p)
	pr.read += int64(n)
	if pr.total > 0 {
		progress := float64(pr.read) / float64(pr.total) * 100
		emit(EventUploadProgress, UploadProgressEvent{Key: pr.key, Progress: progress})
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

// uploadFileWithKey uploads a single local file to S3 under the given key, emitting progress events.
func (a *App) uploadFileWithKey(bucket, key, localPath string, size int64) error {
	f, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer f.Close()

	pr := &progressReader{
		r:     f,
		total: size,
		key:   key,
	}

	_, err = a.s3Client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket:        aws.String(bucket),
		Key:           aws.String(key),
		Body:          pr,
		ContentLength: aws.Int64(size),
	})
	if err != nil {
		emit(EventUploadError, UploadErrorEvent{Key: key, Error: err.Error()})
		return err
	}
	emit(EventUploadDone, UploadDoneEvent{Key: key})
	return nil
}

// uploadFolderContents recursively uploads a local directory to S3, preserving structure.
func (a *App) uploadFolderContents(bucket, s3Prefix, localFolderPath string) error {
	folderName := filepath.Base(localFolderPath)
	destPrefix := s3Prefix + folderName + "/"

	// Count files first so the frontend can show a progress bar.
	total := 0
	_ = filepath.Walk(localFolderPath, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			total++
		}
		return nil
	})
	emit(EventUploadFolderStart, UploadFolderStartEvent{Total: total})

	return filepath.Walk(localFolderPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		relPath, err := filepath.Rel(localFolderPath, path)
		if err != nil {
			return err
		}
		s3Key := destPrefix + filepath.ToSlash(relPath)
		return a.uploadFileWithKey(bucket, s3Key, path, info.Size())
	})
}

// UploadFile uploads a local file (or folder) to S3, emitting progress events.
func (a *App) UploadFile(bucket, prefix, localPath string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	fi, err := os.Stat(localPath)
	if err != nil {
		return err
	}
	if fi.IsDir() {
		return a.uploadFolderContents(bucket, prefix, localPath)
	}

	key := prefix + filepath.Base(localPath)
	return a.uploadFileWithKey(bucket, key, localPath, fi.Size())
}

// UploadFiles uploads multiple local files or folders sequentially.
func (a *App) UploadFiles(bucket, prefix string, localPaths []string) error {
	for _, path := range localPaths {
		if err := a.UploadFile(bucket, prefix, path); err != nil {
			return err
		}
	}
	return nil
}
