package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	// Registered events get strongly typed JS/TS APIs from the binding generator.
	application.RegisterEvent[UploadFolderStartEvent](EventUploadFolderStart)
	application.RegisterEvent[UploadProgressEvent](EventUploadProgress)
	application.RegisterEvent[UploadDoneEvent](EventUploadDone)
	application.RegisterEvent[UploadErrorEvent](EventUploadError)
}

// newApplication builds the Wails app with its service, updater and main window
func newApplication(service *App) *application.App {
	app := application.New(application.Options{
		Name:        "Oso",
		Description: "Oso — Object Storage Operator",
		Services: []application.Service{
			application.NewService(service),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	if err := initUpdater(app, service.GetVersion()); err != nil {
		log.Printf("updater disabled: %v", err)
	}

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Oso — Object Storage Operator",
		Width:            1020,
		Height:           740,
		MinWidth:         1020,
		MinHeight:        740,
		Frameless:        true,
		BackgroundColour: application.NewRGB(30, 33, 41),
		URL:              "/",
	})

	return app
}

func main() {
	if err := newApplication(NewApp()).Run(); err != nil {
		log.Fatal(err)
	}
}
