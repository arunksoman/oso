package main

import (
	"embed"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/build
var assets embed.FS

func main() {
	wailsApp := application.New(application.Options{
		Name:        "Oso — Object Storage Operator",
		Description: "Object Storage Operator",
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	service := NewApp(wailsApp)
	wailsApp.RegisterService(application.NewService(service))

	wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Oso — Object Storage Operator",
		Width:            1020,
		Height:           740,
		MinWidth:         1020,
		MinHeight:        740,
		Frameless:        true,
		BackgroundColour: application.NewRGBA(30, 33, 41, 255),
	})

	if err := wailsApp.Run(); err != nil {
		println("Error:", err.Error())
	}
}
