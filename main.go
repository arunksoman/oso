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
	application.RegisterEvent[AppSettings](EventSettingsChanged)
	application.RegisterEvent[ProfilesChangedEvent](EventProfilesChanged)
	application.RegisterEvent[FilesDroppedEvent](EventFilesDropped)
	application.RegisterEvent[string](EventSettingsNavigate)
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

	newMainWindow(app)

	return app
}

func main() {
	if err := newApplication(NewApp()).Run(); err != nil {
		log.Fatal(err)
	}
}
