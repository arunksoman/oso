package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// GetSettings returns application settings (with defaults)
func (a *App) GetSettings() AppSettings {
	data, err := os.ReadFile(a.settingsPath())
	if err != nil {
		home, _ := os.UserHomeDir()
		return AppSettings{
			DefaultDownloadPath: filepath.Join(home, "Downloads"),
			AskBeforeDownload:   true,
			ShowFileDetails:     true,
			PageSize:            1000,
		}
	}
	var settings AppSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		home, _ := os.UserHomeDir()
		return AppSettings{
			DefaultDownloadPath: filepath.Join(home, "Downloads"),
			AskBeforeDownload:   true,
			ShowFileDetails:     true,
			PageSize:            1000,
		}
	}
	if settings.PageSize <= 0 {
		settings.PageSize = 1000
	}
	return settings
}

// SaveSettings persists application settings
func (a *App) SaveSettings(settings AppSettings) error {
	if err := os.MkdirAll(a.configDir(), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.settingsPath(), data, 0600)
}
