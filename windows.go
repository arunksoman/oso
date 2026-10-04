package main

import (
	"net/url"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Window event names emitted to the frontend
const (
	EventFilesDropped     = "files:dropped"
	EventSettingsNavigate = "settings:navigate"
)

const (
	mainWindowName     = "main"
	settingsWindowName = "settings"
	// dropPrefixAttribute is set on folder rows, so that files dropped on a
	// folder are uploaded into it instead of the folder being shown
	dropPrefixAttribute = "data-drop-prefix"
)

// FilesDroppedEvent reports files dragged from the OS onto the main window
type FilesDroppedEvent struct {
	Paths []string `json:"paths"`
	// Prefix is the folder the files were dropped on; empty means the folder
	// currently shown
	Prefix string `json:"prefix"`
}

// newMainWindow creates the explorer window
func newMainWindow(app *application.App) *application.WebviewWindow {
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             mainWindowName,
		Title:            "Oso — Object Storage Operator",
		Width:            1020,
		Height:           740,
		MinWidth:         1020,
		MinHeight:        740,
		Frameless:        true,
		EnableFileDrop:   true,
		BackgroundColour: application.NewRGB(30, 33, 41),
		URL:              "/",
	})
	window.OnWindowEvent(events.Common.WindowFilesDropped, handleFilesDropped)
	// The settings window must not keep the app alive once the explorer is gone
	window.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		closeSettingsWindow(app)
	})
	return window
}

func closeSettingsWindow(app *application.App) {
	if window, ok := app.Window.GetByName(settingsWindowName); ok {
		window.Close()
	}
}

func handleFilesDropped(event *application.WindowEvent) {
	ctx := event.Context()
	if ctx == nil {
		return
	}
	if dropped, ok := newFilesDroppedEvent(ctx.DroppedFiles(), ctx.DropTargetDetails()); ok {
		emit(EventFilesDropped, dropped)
	}
}

func newFilesDroppedEvent(paths []string, target *application.DropTargetDetails) (FilesDroppedEvent, bool) {
	if len(paths) == 0 {
		return FilesDroppedEvent{}, false
	}
	event := FilesDroppedEvent{Paths: paths}
	if target != nil {
		event.Prefix = target.Attributes[dropPrefixAttribute]
	}
	return event, true
}

func settingsURL(section string) string {
	if section == "" {
		return "/settings"
	}
	return "/settings?section=" + url.QueryEscape(section)
}

// OpenSettingsWindow shows the settings window, creating it on first use, and
// selects the given section ("general", "connections", "about"; empty keeps the
// current one). It returns false in server mode, where there are no native
// windows and the frontend opens the settings page itself.
func (a *App) OpenSettingsWindow(section string) bool {
	if !nativeWindows {
		return false
	}
	app := application.Get()

	if window, ok := app.Window.GetByName(settingsWindowName); ok {
		if section != "" {
			emit(EventSettingsNavigate, section)
		}
		window.UnMinimise()
		window.Show()
		window.Focus()
		return true
	}

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             settingsWindowName,
		Title:            "Oso — Settings",
		Width:            820,
		Height:           600,
		MinWidth:         720,
		MinHeight:        520,
		Frameless:        true,
		BackgroundColour: application.NewRGB(30, 33, 41),
		URL:              settingsURL(section),
	})
	return true
}
