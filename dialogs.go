package main

import (
	"os"
	"path/filepath"
)

// OpenFileDialog opens a single-file picker dialog
func (a *App) OpenFileDialog() (string, error) {
	return a.app.Dialog.OpenFile().
		SetTitle("Select File to Upload").
		PromptForSingleSelection()
}

// OpenMultipleFilesDialog opens a multi-file picker dialog
func (a *App) OpenMultipleFilesDialog() ([]string, error) {
	return a.app.Dialog.OpenFile().
		SetTitle("Select Files to Upload").
		PromptForMultipleSelection()
}

// OpenDirectoryDialog opens a folder-picker dialog
func (a *App) OpenDirectoryDialog() (string, error) {
	return a.app.Dialog.OpenFile().
		SetTitle("Select Download Location").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		PromptForSingleSelection()
}

// SaveFileDialog opens a save-file dialog
func (a *App) SaveFileDialog(defaultName string) (string, error) {
	return a.app.Dialog.SaveFile().
		SetMessage("Save File As").
		PromptForSingleSelection()
}

// GetDownloadsFolder returns the system Downloads folder path
func (a *App) GetDownloadsFolder() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Downloads")
}
