package main

import (
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// homeAsFile makes the config directory impossible to create
func homeAsFile(t *testing.T) {
	t.Helper()
	file := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(file, nil, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", file)
	t.Setenv("USERPROFILE", file)
}

func TestSaveFailsWhenConfigDirCannotBeCreated(t *testing.T) {
	homeAsFile(t)
	app := NewApp()

	profile := ConnectionProfile{Endpoint: "http://localhost:9000", AccessKey: "key", SecretKey: "secret"}
	if _, err := app.SaveProfile(profile); err == nil {
		t.Error("SaveProfile: expected an error")
	}
	if err := app.SaveSettings(AppSettings{PageSize: 100}); err == nil {
		t.Error("SaveSettings: expected an error")
	}
}

func TestConnectReportsSaveFailure(t *testing.T) {
	_, srv := newFakeS3(t)
	homeAsFile(t)
	app := NewApp()

	err := app.Connect(S3Config{Endpoint: srv.URL, AccessKey: "key", SecretKey: "secret"})

	if err == nil {
		t.Error("expected Connect to report that the config could not be saved")
	}
}

func TestServerErrorsAreReturned(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "dir/file.txt", "x")
	fake.deny = true
	local := filepath.Join(t.TempDir(), "file.txt")
	if err := os.WriteFile(local, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}

	calls := map[string]func() error{
		"ListBuckets":    func() error { _, err := app.ListBuckets(); return err },
		"CreateBucket":   func() error { return app.CreateBucket("valid-name") },
		"ListObjects":    func() error { _, err := app.ListObjects("b", "", "", 10); return err },
		"SearchObjects":  func() error { _, err := app.SearchObjects("b", "", "file", 10); return err },
		"DeleteObjects":  func() error { return app.DeleteObjects("b", []string{"dir/file.txt"}) },
		"DeleteFolder":   func() error { return app.DeleteFolder("b", "dir/") },
		"CopyFolder":     func() error { return app.CopyFolder("b", "dir/", "b", "copy/") },
		"MoveFolder":     func() error { return app.MoveFolder("b", "dir/", "b", "moved/") },
		"DownloadObject": func() error { return app.DownloadObject("b", "dir/file.txt", filepath.Join(t.TempDir(), "f")) },
		"CreateFolder":   func() error { return app.CreateFolder("b", "", "new") },
		"UploadFile":     func() error { return app.UploadFile("b", "", local) },
		"DeleteBucket":   func() error { return app.DeleteBucket("b", false) },
		"EmptyBucket":    func() error { return app.DeleteBucket("b", true) },
		"GetProperties":  func() error { _, err := app.GetObjectProperties("b", "dir/file.txt"); return err },
		"SetProperties":  func() error { return app.UpdateObjectProperties("b", "dir/file.txt", "text/plain", nil) },
		"TestConnection": func() error { return app.TestConnection(*app.GetSavedConfig()) },
	}
	for name, call := range calls {
		if err := call(); err == nil {
			t.Errorf("%s: expected the server error to be returned", name)
		}
	}

	fake.deny = false
	if got, want := fake.keys("b"), []string{"dir/file.txt"}; !reflect.DeepEqual(got, want) {
		t.Errorf("keys after failed calls = %v, want %v", got, want)
	}
}

func TestDeleteFolderStopsWhenDeleteFails(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "dir/a.txt", "a")
	fake.denyMethod = http.MethodDelete

	if err := app.DeleteFolder("b", "dir/"); err == nil {
		t.Error("expected the delete error to be returned")
	}
}

// A failed copy must leave the source untouched: move is copy + delete
func TestMoveFolderKeepsSourceWhenCopyFails(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "src/a.txt", "a")
	fake.put("b", "src/b.txt", "b")
	fake.denyMethod = http.MethodPut

	if err := app.MoveFolder("b", "src/", "b", "dst/"); err == nil {
		t.Fatal("expected the copy error to be returned")
	}
	if got, want := fake.keys("b"), []string{"src/a.txt", "src/b.txt"}; !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}
}

func TestDownloadObjectLocalErrors(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "file.txt", "x")
	dir := t.TempDir()
	blocker := filepath.Join(dir, "blocker")
	if err := os.WriteFile(blocker, nil, 0600); err != nil {
		t.Fatal(err)
	}

	// Parent path is a file, so the directory cannot be created
	if err := app.DownloadObject("b", "file.txt", filepath.Join(blocker, "sub", "file.txt")); err == nil {
		t.Error("expected an error when the destination directory cannot be created")
	}
	// Destination is an existing directory, so the file cannot be created
	if err := app.DownloadObject("b", "file.txt", dir); err == nil {
		t.Error("expected an error when the destination is a directory")
	}
}

func TestUploadFileWithKeyMissingLocalFile(t *testing.T) {
	app, fake := newConnectedApp(t)

	if err := app.uploadFileWithKey("b", "key", filepath.Join(t.TempDir(), "missing"), 1); err == nil {
		t.Error("expected an error for a missing local file")
	}
	if len(fake.keys("b")) != 0 {
		t.Error("nothing should have been uploaded")
	}
}

func TestUploadFolderMissingDirectory(t *testing.T) {
	app, _ := newConnectedApp(t)

	if err := app.uploadFolderContents("b", "", filepath.Join(t.TempDir(), "missing"), true); err == nil {
		t.Error("expected an error for a missing local folder")
	}
}

func TestProgressReaderSeekError(t *testing.T) {
	file, err := os.Open(os.Args[0])
	if err != nil {
		t.Skip("cannot open the test binary")
	}
	pr := &progressReader{r: file, total: 10, read: 7}
	file.Close()

	if _, err := pr.Seek(0, 0); err == nil {
		t.Fatal("expected a seek error on a closed file")
	}
	if pr.read != 7 {
		t.Errorf("read = %d after a failed seek, want 7", pr.read)
	}
}

func TestSearchObjectsCapsOnFolders(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("b", "data/", "") // folder marker for the searched prefix itself
	fake.put("b", "data/logs-a/x.txt", "x")
	fake.put("b", "data/logs-b/x.txt", "x")
	fake.put("b", "data/logs.txt", "x")

	results, err := app.SearchObjects("b", "data/", "logs", 2)
	if err != nil {
		t.Fatalf("SearchObjects: %v", err)
	}
	if got, want := objectKeys(results), []string{"data/logs-a/", "data/logs-b/"}; !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}

	// Without the cap, the marker object is skipped and the file is found
	results, err = app.SearchObjects("b", "data/", "", 10)
	if err != nil || len(results) != 0 {
		t.Errorf("empty query = (%v, %v), want no results", results, err)
	}
	results, err = app.SearchObjects("b", "data/", "data", 0)
	if err != nil || len(results) != 0 {
		t.Errorf("marker object leaked into results: (%v, %v)", objectKeys(results), err)
	}
}
