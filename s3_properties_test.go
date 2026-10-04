package main

import (
	"reflect"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestGetObjectProperties(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "docs/report.pdf", "12345")
	fake.setMeta("b", "docs/report.pdf", fakeMeta{
		contentType:  "application/pdf",
		cacheControl: "max-age=60",
		metadata:     map[string]string{"author": "ada"},
		tags:         map[string]string{"team": "finance", "year": "2026"},
	})

	props, err := app.GetObjectProperties("b", "docs/report.pdf")
	if err != nil {
		t.Fatalf("GetObjectProperties: %v", err)
	}

	want := &ObjectProperties{
		Bucket:       "b",
		Key:          "docs/report.pdf",
		Size:         5,
		LastModified: "2026-01-02T03:04:05Z",
		ContentType:  "application/pdf",
		ETag:         "etag-5",
		StorageClass: "STANDARD",
		CacheControl: "max-age=60",
		Metadata:     map[string]string{"author": "ada"},
		Tags:         map[string]string{"team": "finance", "year": "2026"},
	}
	if !reflect.DeepEqual(props, want) {
		t.Errorf("properties = %+v, want %+v", props, want)
	}
}

func TestGetObjectPropertiesWithoutTaggingSupport(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "a.txt", "a")
	fake.noTagging = true

	props, err := app.GetObjectProperties("b", "a.txt")
	if err != nil {
		t.Fatalf("GetObjectProperties: %v", err)
	}
	if props.Tags == nil || len(props.Tags) != 0 || props.Metadata == nil {
		t.Errorf("tags = %v, metadata = %v; want empty, non-nil maps", props.Tags, props.Metadata)
	}
}

func TestGetObjectPropertiesMissingKey(t *testing.T) {
	app, _ := newConnectedApp(t)

	if _, err := app.GetObjectProperties("b", "missing.txt"); err == nil {
		t.Error("expected an error for a missing object")
	}
}

func TestUpdateObjectProperties(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "my docs/a b.txt", "body")
	fake.setMeta("b", "my docs/a b.txt", fakeMeta{
		contentType:  "application/octet-stream",
		cacheControl: "no-cache",
		metadata:     map[string]string{"old": "value"},
		tags:         map[string]string{"keep": "me"},
	})

	err := app.UpdateObjectProperties("b", "my docs/a b.txt", " text/plain ", map[string]string{" Author ": " ada "})
	if err != nil {
		t.Fatalf("UpdateObjectProperties: %v", err)
	}

	if body, _ := fake.get("b", "my docs/a b.txt"); body != "body" {
		t.Errorf("body = %q, want it unchanged", body)
	}
	meta := fake.getMeta("b", "my docs/a b.txt")
	if meta.contentType != "text/plain" {
		t.Errorf("content type = %q, want text/plain", meta.contentType)
	}
	if want := map[string]string{"author": "ada"}; !reflect.DeepEqual(meta.metadata, want) {
		t.Errorf("metadata = %v, want %v", meta.metadata, want)
	}
	// Headers and tags that are not edited survive the copy
	if meta.cacheControl != "no-cache" || meta.tags["keep"] != "me" {
		t.Errorf("cache control = %q, tags = %v; want them carried over", meta.cacheControl, meta.tags)
	}
}

func TestUpdateObjectPropertiesDefaultsContentType(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "a.bin", "x")

	if err := app.UpdateObjectProperties("b", "a.bin", "  ", nil); err != nil {
		t.Fatalf("UpdateObjectProperties: %v", err)
	}
	if got := fake.getMeta("b", "a.bin").contentType; got != "application/octet-stream" {
		t.Errorf("content type = %q, want application/octet-stream", got)
	}
}

func TestUpdateObjectPropertiesValidation(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "a.txt", "x")
	fake.put("b", "huge.bin", "x")
	fake.setMeta("b", "huge.bin", fakeMeta{size: maxCopyInPlaceSize + 1})

	tests := []struct {
		name     string
		key      string
		metadata map[string]string
		wantErr  string
	}{
		{"empty metadata key", "a.txt", map[string]string{"  ": "v"}, "must not be empty"},
		{"metadata key with a space", "a.txt", map[string]string{"two words": "v"}, "invalid metadata key"},
		{"metadata key with a colon", "a.txt", map[string]string{"a:b": "v"}, "invalid metadata key"},
		{"larger than one copy allows", "huge.bin", nil, "5 GiB"},
		{"missing object", "missing.txt", nil, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := app.UpdateObjectProperties("b", tt.key, "text/plain", tt.metadata)
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("err = %v, want one containing %q", err, tt.wantErr)
			}
		})
	}
	if got := fake.getMeta("b", "a.txt").contentType; got == "text/plain" {
		t.Error("a rejected update must not change the object")
	}
}

func TestDeleteBucket(t *testing.T) {
	app, fake := newConnectedApp(t)
	if err := app.CreateBucket("empty-bucket"); err != nil {
		t.Fatal(err)
	}

	if err := app.DeleteBucket("empty-bucket", false); err != nil {
		t.Fatalf("DeleteBucket: %v", err)
	}
	if fake.hasBucket("empty-bucket") {
		t.Error("the bucket still exists")
	}
}

func TestDeleteBucketRefusesNonEmptyBucket(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("full-bucket", "a.txt", "a")

	err := app.DeleteBucket("full-bucket", false)

	if err == nil || !strings.Contains(err.Error(), "failed to delete bucket") {
		t.Errorf("err = %v, want a delete failure", err)
	}
	if got := fake.keys("full-bucket"); len(got) != 1 {
		t.Errorf("keys = %v, want the object untouched", got)
	}
}

func TestDeleteBucketWithContents(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.pageCap = 2
	for _, key := range []string{"a.txt", "dir/b.txt", "dir/deep/c.txt", "dir/deep/d.txt", "e.txt"} {
		fake.put("full-bucket", key, "x")
	}
	fake.put("other-bucket", "keep.txt", "x")

	if err := app.DeleteBucket("full-bucket", true); err != nil {
		t.Fatalf("DeleteBucket: %v", err)
	}
	if fake.hasBucket("full-bucket") {
		t.Error("the bucket still exists")
	}
	if got := fake.keys("other-bucket"); len(got) != 1 {
		t.Errorf("other bucket keys = %v, want it untouched", got)
	}
}

func TestNewFilesDroppedEvent(t *testing.T) {
	paths := []string{"/tmp/a.txt", "/tmp/photos"}

	if _, ok := newFilesDroppedEvent(nil, nil); ok {
		t.Error("a drop without files must be ignored")
	}

	event, ok := newFilesDroppedEvent(paths, nil)
	if !ok || !reflect.DeepEqual(event, FilesDroppedEvent{Paths: paths}) {
		t.Errorf("event = (%+v, %v), want the paths and no prefix", event, ok)
	}

	target := &application.DropTargetDetails{Attributes: map[string]string{dropPrefixAttribute: "photos/2026/"}}
	event, _ = newFilesDroppedEvent(paths, target)
	if event.Prefix != "photos/2026/" {
		t.Errorf("Prefix = %q, want the folder the files were dropped on", event.Prefix)
	}
}

func TestHandleFilesDroppedIgnoresEmptyDrop(t *testing.T) {
	// A drop event without files carries nothing to upload and must not panic
	handleFilesDropped(application.NewWindowEvent())
}

func TestSettingsURL(t *testing.T) {
	if got := settingsURL(""); got != "/settings" {
		t.Errorf("settingsURL(\"\") = %q", got)
	}
	if got := settingsURL("connections"); got != "/settings?section=connections" {
		t.Errorf("settingsURL(\"connections\") = %q", got)
	}
}

func TestUploadFilesWithFolders(t *testing.T) {
	app, fake := newConnectedApp(t)
	dir := t.TempDir()
	writeLocal(t, dir, "notes.txt", "notes")
	writeLocal(t, dir, "photos/a.jpg", "a")
	writeLocal(t, dir, "photos/trip/b.jpg", "b")

	err := app.UploadFiles("b", "in/", []string{dir + "/notes.txt", dir + "/photos"})
	if err != nil {
		t.Fatalf("UploadFiles: %v", err)
	}

	want := []string{"in/notes.txt", "in/photos/a.jpg", "in/photos/trip/b.jpg"}
	if got := fake.keys("b"); !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}
	if got := countFiles(dir); got != 3 {
		t.Errorf("countFiles() = %d, want 3", got)
	}
}
