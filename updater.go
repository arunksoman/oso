package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

// updateRepository is the GitHub repository whose releases feed the updater
const updateRepository = "arunksoman/oso"

// updateChecksumAsset is the sha256sum listing release.yml attaches to each release
const updateChecksumAsset = "SHA256SUMS"

// updateAssetName returns the release asset that replaces the running app on
// the given platform. The names must match the files release.yml publishes.
func updateAssetName(platform, arch string) string {
	switch platform {
	case "windows":
		return "oso-windows-" + arch + ".exe"
	case "linux":
		return "oso-linux-" + arch
	case "darwin":
		return "oso-macos-universal.zip"
	}
	return ""
}

func matchUpdateAsset(req updater.CheckRequest, assets []github.ReleaseAsset) int {
	name := updateAssetName(req.Platform, req.Arch)
	for i, asset := range assets {
		if name != "" && asset.Name == name {
			return i
		}
	}
	return -1
}

// initUpdater configures the Wails updater against GitHub Releases
func initUpdater(app *application.App, currentVersion string) error {
	provider, err := github.New(github.Config{
		Repository: updateRepository,
		// Pre-release builds follow the pre-release channel; stable builds only see stable releases
		Prerelease:    strings.Contains(currentVersion, "-"),
		AssetMatcher:  matchUpdateAsset,
		ChecksumAsset: updateChecksumAsset,
	})
	if err != nil {
		return err
	}
	return app.Updater.Init(updater.Config{
		CurrentVersion: currentVersion,
		Providers:      []updater.Provider{provider},
	})
}

// GetAvailableUpdate silently checks for a newer release and returns its
// version, or an empty string when the app is up to date.
func (a *App) GetAvailableUpdate() (string, error) {
	release, err := application.Get().Updater.Check(context.Background())
	if err != nil {
		return "", fmt.Errorf("update check failed: %w", err)
	}
	if release == nil {
		return "", nil
	}
	return release.Version, nil
}

// CheckForUpdates opens the update window and runs the check, download and
// install flow. Progress and errors are shown in that window.
func (a *App) CheckForUpdates() {
	app := application.Get()
	go func() {
		if err := app.Updater.CheckAndInstall(context.Background()); err != nil {
			app.Logger.Error("update flow failed", "error", err)
		}
	}()
}
