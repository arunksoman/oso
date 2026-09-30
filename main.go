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

func main() {
	app := application.New(application.Options{
		Name:        "Oso",
		Description: "Oso — Object Storage Operator",
		Services: []application.Service{
			application.NewService(NewApp()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

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

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
