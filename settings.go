package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// EventSettingsChanged carries the saved settings to every window
const EventSettingsChanged = "settings:changed"

const (
	themeNight = "night"
	themeLight = "light"
)

func defaultSettings() AppSettings {
	home, _ := os.UserHomeDir()
	return AppSettings{
		DefaultDownloadPath: filepath.Join(home, "Downloads"),
		AskBeforeDownload:   true,
		ShowFileDetails:     true,
		PageSize:            1000,
		Theme:               themeNight,
	}
}

// GetSettings returns application settings (with defaults)
func (a *App) GetSettings() AppSettings {
	data, err := os.ReadFile(a.settingsPath())
	if err != nil {
		return defaultSettings()
	}
	var settings AppSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		return defaultSettings()
	}
	if settings.PageSize <= 0 {
		settings.PageSize = 1000
	}
	if settings.Theme != themeLight {
		settings.Theme = themeNight
	}
	return settings
}

// SaveSettings persists application settings and tells every window
func (a *App) SaveSettings(settings AppSettings) error {
	if err := os.MkdirAll(a.configDir(), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(a.settingsPath(), data, 0600); err != nil {
		return err
	}
	emit(EventSettingsChanged, a.GetSettings())
	return nil
}
