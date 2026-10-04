package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetSettingsDefaults(t *testing.T) {
	home := isolateHome(t)
	want := AppSettings{
		DefaultDownloadPath: filepath.Join(home, "Downloads"),
		AskBeforeDownload:   true,
		ShowFileDetails:     true,
		PageSize:            1000,
		Theme:               "night",
	}

	t.Run("missing file", func(t *testing.T) {
		if got := NewApp().GetSettings(); got != want {
			t.Errorf("GetSettings() = %+v, want %+v", got, want)
		}
	})

	t.Run("invalid JSON", func(t *testing.T) {
		app := NewApp()
		if err := os.MkdirAll(app.configDir(), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(app.settingsPath(), []byte("{not json"), 0600); err != nil {
			t.Fatal(err)
		}
		if got := app.GetSettings(); got != want {
			t.Errorf("GetSettings() = %+v, want %+v", got, want)
		}
	})
}

func TestSaveSettingsRoundTrip(t *testing.T) {
	isolateHome(t)
	app := NewApp()
	settings := AppSettings{
		DefaultDownloadPath: "/tmp/downloads",
		AskBeforeDownload:   false,
		ShowFileDetails:     false,
		PageSize:            250,
		Theme:               "light",
	}

	if err := app.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings: %v", err)
	}
	if got := app.GetSettings(); got != settings {
		t.Errorf("GetSettings() = %+v, want %+v", got, settings)
	}
}

func TestGetSettingsRepairsPageSize(t *testing.T) {
	isolateHome(t)
	app := NewApp()

	for _, pageSize := range []int32{0, -5} {
		if err := app.SaveSettings(AppSettings{PageSize: pageSize}); err != nil {
			t.Fatal(err)
		}
		if got := app.GetSettings().PageSize; got != 1000 {
			t.Errorf("PageSize %d loaded as %d, want 1000", pageSize, got)
		}
	}
}

func TestGetSettingsRepairsTheme(t *testing.T) {
	isolateHome(t)
	app := NewApp()

	for _, theme := range []string{"", "solarized"} {
		if err := app.SaveSettings(AppSettings{PageSize: 100, Theme: theme}); err != nil {
			t.Fatal(err)
		}
		if got := app.GetSettings().Theme; got != "night" {
			t.Errorf("Theme %q loaded as %q, want night", theme, got)
		}
	}
}
