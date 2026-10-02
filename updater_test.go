package main

import (
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

func TestUpdateAssetName(t *testing.T) {
	tests := []struct {
		platform, arch, want string
	}{
		{"windows", "amd64", "oso-windows-amd64.exe"},
		{"windows", "arm64", "oso-windows-arm64.exe"},
		{"linux", "amd64", "oso-linux-amd64"},
		{"darwin", "arm64", "oso-macos-universal.zip"},
		{"darwin", "amd64", "oso-macos-universal.zip"},
		{"freebsd", "amd64", ""},
	}
	for _, tt := range tests {
		if got := updateAssetName(tt.platform, tt.arch); got != tt.want {
			t.Errorf("updateAssetName(%q, %q) = %q, want %q", tt.platform, tt.arch, got, tt.want)
		}
	}
}

func TestMatchUpdateAsset(t *testing.T) {
	assets := []github.ReleaseAsset{
		{Name: "oso-linux-amd64"},
		{Name: "oso_0.7.0_amd64.deb"},
		{Name: "oso-windows-amd64-installer.exe"},
		{Name: "oso-windows-amd64.exe"},
		{Name: "oso-macos-universal.zip"},
		{Name: "SHA256SUMS"},
	}
	tests := []struct {
		platform, arch string
		want           int
	}{
		{"linux", "amd64", 0},
		// The installer must never be picked as the in-place replacement binary
		{"windows", "amd64", 3},
		{"darwin", "arm64", 4},
		{"linux", "arm64", -1},
		{"freebsd", "amd64", -1},
	}
	for _, tt := range tests {
		req := updater.CheckRequest{Platform: tt.platform, Arch: tt.arch}
		if got := matchUpdateAsset(req, assets); got != tt.want {
			t.Errorf("matchUpdateAsset(%s/%s) = %d, want %d", tt.platform, tt.arch, got, tt.want)
		}
	}

	if got := matchUpdateAsset(updater.CheckRequest{Platform: "linux", Arch: "amd64"}, nil); got != -1 {
		t.Errorf("matchUpdateAsset with no assets = %d, want -1", got)
	}
}

// The updater only finds assets whose names release.yml actually publishes
func TestReleaseWorkflowPublishesUpdateAssets(t *testing.T) {
	data, err := os.ReadFile(".github/workflows/release.yml")
	if errors.Is(err, os.ErrNotExist) {
		t.Skip("release workflow not present")
	}
	if err != nil {
		t.Fatal(err)
	}
	workflow := strings.ReplaceAll(string(data), "\r\n", "\n")

	names := []string{
		updateAssetName("windows", "amd64"),
		updateAssetName("linux", "amd64"),
		updateAssetName("darwin", "arm64"),
		updateChecksumAsset,
	}
	for _, name := range names {
		if !strings.Contains(workflow, "artifacts/"+name+"\n") {
			t.Errorf("release.yml does not publish %q", name)
		}
	}
}
