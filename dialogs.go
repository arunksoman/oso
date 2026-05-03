package main

import (
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

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
