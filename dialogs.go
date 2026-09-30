package main

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// openDialog returns an open-file dialog attached to the current window
func openDialog(title string) *application.OpenFileDialogStruct {
	app := application.Get()
	d := app.Dialog.OpenFile().SetTitle(title)
	if w := app.Window.Current(); w != nil {
		d.AttachToWindow(w)
	}
	return d
}

// ignoreCancel maps a user-cancelled dialog to an empty result (as in Wails v2)
// instead of an error. Wails v3 on Windows reports cancellation as an error.
func ignoreCancel[T any](result T, err error) (T, error) {
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "cancelled") {
		var zero T
		return zero, nil
	}
	return result, err
}

// OpenFileDialog opens a single-file picker dialog
func (a *App) OpenFileDialog() (string, error) {
	return ignoreCancel(openDialog("Select File to Upload").
		CanChooseFiles(true).
		PromptForSingleSelection())
}

// OpenMultipleFilesDialog opens a multi-file picker dialog
func (a *App) OpenMultipleFilesDialog() ([]string, error) {
	return ignoreCancel(openDialog("Select Files to Upload").
		CanChooseFiles(true).
		PromptForMultipleSelection())
}

// OpenDirectoryDialog opens a folder-picker dialog
func (a *App) OpenDirectoryDialog() (string, error) {
	return ignoreCancel(openDialog("Select Download Location").
		CanChooseFiles(false).
		CanChooseDirectories(true).
		CanCreateDirectories(true).
		PromptForSingleSelection())
}

// SaveFileDialog opens a save-file dialog
func (a *App) SaveFileDialog(defaultName string) (string, error) {
	app := application.Get()
	d := app.Dialog.SaveFile().
		SetMessage("Save File As").
		SetFilename(defaultName).
		CanCreateDirectories(true)
	if w := app.Window.Current(); w != nil {
		d.AttachToWindow(w)
	}
	return ignoreCancel(d.PromptForSingleSelection())
}

// GetDownloadsFolder returns the system Downloads folder path
func (a *App) GetDownloadsFolder() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Downloads")
}
