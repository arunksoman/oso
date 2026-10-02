//go:build server

package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// These tests run against a real Wails application. The server build tag
// swaps the native GUI for a headless implementation, so they work on every
// OS and in CI without a display: go test -tags server ./...

// fakeGitHub serves the releases API the updater polls
type fakeGitHub struct {
	mu     sync.Mutex
	status int
	tag    string
	assets []string
}

func (g *fakeGitHub) set(status int, tag string, assets ...string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.status, g.tag, g.assets = status, tag, assets
}

func (g *fakeGitHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if strings.HasPrefix(r.URL.Path, "/download/") {
		// SHA256SUMS sidecar: one digest line per published asset
		for _, name := range g.assets {
			fmt.Fprintf(w, "%s  %s\n", strings.Repeat("ab", 32), name)
		}
		return
	}
	if g.status != http.StatusOK {
		http.Error(w, "rate limited", g.status)
		return
	}

	assets := make([]string, len(g.assets))
	for i, name := range g.assets {
		assets[i] = fmt.Sprintf(`{"id":%d,"name":%q,"size":10,"browser_download_url":"http://%s/download/%s"}`,
			i+1, name, r.Host, name)
	}
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"tag_name":%q,"name":%q,"assets":[%s]}`, g.tag, g.tag, strings.Join(assets, ","))
}

// syncBuffer is a goroutine-safe log sink
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

var (
	wailsOnce    sync.Once
	wailsApp     *application.App
	wailsService *App
	wailsGitHub  = &fakeGitHub{status: http.StatusNotFound}
	wailsLog     = &syncBuffer{}
	wailsURL     string
)

// allUpdateAssets is the full asset set release.yml publishes
var allUpdateAssets = []string{
	"oso-linux-amd64", "oso-linux-arm64",
	"oso-windows-amd64.exe", "oso-windows-arm64.exe",
	"oso-macos-universal.zip",
	updateChecksumAsset,
}

// wailsTestApp returns the process-wide Wails application. Wails allows one
// application per process and one updater configuration per application.
func wailsTestApp(t *testing.T) (*application.App, *App) {
	t.Helper()
	wailsOnce.Do(func() {
		srv := httptest.NewServer(wailsGitHub)
		updateAPIBaseURL = srv.URL
		// A stable current version makes the updater use /releases/latest
		version = "1.0.0"

		wailsService = NewApp()
		wailsApp = newApplication(wailsService)
		wailsApp.Logger = slog.New(slog.NewTextHandler(wailsLog, nil))

		// Dialogs and the main-thread dispatcher only exist once the app runs
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatalf("no free port: %v", err)
		}
		port := listener.Addr().(*net.TCPAddr).Port
		listener.Close()
		os.Setenv("WAILS_SERVER_HOST", "127.0.0.1")
		os.Setenv("WAILS_SERVER_PORT", fmt.Sprint(port))
		wailsURL = fmt.Sprintf("http://127.0.0.1:%d", port)
		go func() {
			if err := wailsApp.Run(); err != nil {
				wailsApp.Logger.Error("app stopped", "error", err)
			}
		}()
		waitFor(t, "the app to serve HTTP", func() bool {
			resp, err := http.Get(wailsURL + "/")
			if err != nil {
				return false
			}
			resp.Body.Close()
			return true
		})
	})
	return wailsApp, wailsService
}

func waitFor(t *testing.T, what string, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !condition() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestNewApplication(t *testing.T) {
	app, service := wailsTestApp(t)

	if app == nil || application.Get() != app {
		t.Fatal("newApplication did not register the global application")
	}
	if got := app.Updater.CurrentVersion(); got != service.GetVersion() {
		t.Errorf("updater version = %q, want %q", got, service.GetVersion())
	}
	// The updater can only be configured once; a second attempt must fail loudly
	if err := initUpdater(app, "2.0.0"); err == nil {
		t.Error("expected an error when configuring the updater twice")
	}
}

func TestApplicationServesFrontend(t *testing.T) {
	wailsTestApp(t)

	resp, err := http.Get(wailsURL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET / = %d, want 200", resp.StatusCode)
	}
	if !strings.Contains(strings.ToLower(string(body)), "<!doctype html>") {
		t.Error("GET / did not return the embedded frontend")
	}
}

func TestServiceStartupLoadsConfig(t *testing.T) {
	isolateHome(t)
	t.Setenv("S3_ENDPOINT", "http://localhost:9000")
	t.Setenv("S3_ACCESS_KEY", "key")
	t.Setenv("S3_SECRET_KEY", "secret")
	app := NewApp()

	if err := app.ServiceStartup(context.Background(), application.ServiceOptions{}); err != nil {
		t.Fatalf("ServiceStartup: %v", err)
	}
	if !app.IsConnected() {
		t.Error("expected ServiceStartup to connect from the environment")
	}
}

func TestGetAvailableUpdate(t *testing.T) {
	_, service := wailsTestApp(t)

	t.Run("newer release", func(t *testing.T) {
		wailsGitHub.set(http.StatusOK, "v1.2.0", allUpdateAssets...)
		got, err := service.GetAvailableUpdate()
		if err != nil {
			t.Fatalf("GetAvailableUpdate: %v", err)
		}
		if got != "1.2.0" {
			t.Errorf("GetAvailableUpdate() = %q, want 1.2.0", got)
		}
	})

	t.Run("same version is up to date", func(t *testing.T) {
		wailsGitHub.set(http.StatusOK, "v1.0.0", allUpdateAssets...)
		got, err := service.GetAvailableUpdate()
		if err != nil || got != "" {
			t.Errorf("GetAvailableUpdate() = (%q, %v), want (\"\", nil)", got, err)
		}
	})

	t.Run("pre-release is not offered to a stable build", func(t *testing.T) {
		wailsGitHub.set(http.StatusOK, "v1.0.0-beta.1", allUpdateAssets...)
		got, err := service.GetAvailableUpdate()
		if err != nil || got != "" {
			t.Errorf("GetAvailableUpdate() = (%q, %v), want (\"\", nil)", got, err)
		}
	})

	t.Run("no releases published", func(t *testing.T) {
		wailsGitHub.set(http.StatusNotFound, "")
		got, err := service.GetAvailableUpdate()
		if err != nil || got != "" {
			t.Errorf("GetAvailableUpdate() = (%q, %v), want (\"\", nil)", got, err)
		}
	})

	t.Run("release without an asset for this platform", func(t *testing.T) {
		wailsGitHub.set(http.StatusOK, "v1.2.0", updateChecksumAsset)
		_, err := service.GetAvailableUpdate()
		if err == nil || !strings.Contains(err.Error(), "update check failed") {
			t.Errorf("err = %v, want an update check failure", err)
		}
	})

	t.Run("API failure", func(t *testing.T) {
		wailsGitHub.set(http.StatusForbidden, "")
		_, err := service.GetAvailableUpdate()
		if err == nil || !strings.Contains(err.Error(), "update check failed") {
			t.Errorf("err = %v, want an update check failure", err)
		}
	})
}

func TestCheckForUpdates(t *testing.T) {
	app, service := wailsTestApp(t)

	t.Run("up to date", func(t *testing.T) {
		wailsGitHub.set(http.StatusOK, "v1.0.0", allUpdateAssets...)
		service.CheckForUpdates()
		waitFor(t, "the updater to report up to date", func() bool {
			return string(app.Updater.State()) == "up-to-date"
		})
	})

	t.Run("failure is logged, not fatal", func(t *testing.T) {
		wailsGitHub.set(http.StatusForbidden, "")
		service.CheckForUpdates()
		waitFor(t, "the update failure to be logged", func() bool {
			return strings.Contains(wailsLog.String(), "update flow failed")
		})
	})
}

func TestDialogsSurfaceErrors(t *testing.T) {
	_, service := wailsTestApp(t)

	// Server mode has no native dialogs. Anything other than a user cancel
	// must reach the frontend as an error rather than an empty selection.
	if path, err := service.OpenFileDialog(); err == nil || path != "" {
		t.Errorf("OpenFileDialog() = (%q, %v), want an error", path, err)
	}
	if paths, err := service.OpenMultipleFilesDialog(); err == nil || len(paths) != 0 {
		t.Errorf("OpenMultipleFilesDialog() = (%v, %v), want an error", paths, err)
	}
	if path, err := service.OpenDirectoryDialog(); err == nil || path != "" {
		t.Errorf("OpenDirectoryDialog() = (%q, %v), want an error", path, err)
	}
	if path, err := service.SaveFileDialog("report.pdf"); err == nil || path != "" {
		t.Errorf("SaveFileDialog() = (%q, %v), want an error", path, err)
	}
}

func TestUploadEmitsEventsThroughApplication(t *testing.T) {
	wailsTestApp(t)
	app, fake := newConnectedApp(t)
	local := filepath.Join(t.TempDir(), "report.txt")
	if err := os.WriteFile(local, []byte("report body"), 0600); err != nil {
		t.Fatal(err)
	}

	if err := app.UploadFile("b", "", local); err != nil {
		t.Fatalf("UploadFile: %v", err)
	}
	if body, ok := fake.get("b", "report.txt"); !ok || body != "report body" {
		t.Errorf("uploaded body = %q (found %v), want \"report body\"", body, ok)
	}
}
