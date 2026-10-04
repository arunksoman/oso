package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func setBuildConfig(t *testing.T, config string) {
	t.Helper()
	original := buildConfig
	buildConfig = []byte(config)
	t.Cleanup(func() { buildConfig = original })
}

func setVersion(t *testing.T, v string) {
	t.Helper()
	original := version
	version = v
	t.Cleanup(func() { version = original })
}

func TestConfigVersion(t *testing.T) {
	tests := []struct {
		name   string
		config string
		want   string
	}{
		{
			name:   "prefers displayVersion",
			config: "info:\n  version: \"0.7.0\"\n  displayVersion: \"0.7.0-beta.1\"\n",
			want:   "0.7.0-beta.1",
		},
		{
			name:   "falls back to version",
			config: "info:\n  version: \"0.7.0\"\n",
			want:   "0.7.0",
		},
		{
			name:   "empty displayVersion falls back to version",
			config: "info:\n  version: \"0.7.0\"\n  displayVersion: \"\"\n",
			want:   "0.7.0",
		},
		{
			name:   "strips comments and single quotes",
			config: "info:\n  version: '1.2.3' # numeric only\n",
			want:   "1.2.3",
		},
		{
			name:   "ignores version keys outside info",
			config: "other:\n  version: \"9.9.9\"\ninfo:\n  version: \"0.7.0\"\ndev_mode:\n  version: \"8.8.8\"\n",
			want:   "0.7.0",
		},
		{
			name:   "no info section",
			config: "other:\n  version: \"9.9.9\"\n",
			want:   "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setBuildConfig(t, tt.config)
			if got := configVersion(); got != tt.want {
				t.Errorf("configVersion() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestEmbeddedConfigHasVersion(t *testing.T) {
	if configVersion() == "" {
		t.Error("build/config.yml has no info.version or info.displayVersion")
	}
}

func TestGetVersion(t *testing.T) {
	app := NewApp()

	t.Run("stamped version wins", func(t *testing.T) {
		setVersion(t, "1.2.3")
		setBuildConfig(t, "info:\n  version: \"0.7.0\"\n")
		if got := app.GetVersion(); got != "1.2.3" {
			t.Errorf("GetVersion() = %q, want 1.2.3", got)
		}
	})

	t.Run("dev build reads config", func(t *testing.T) {
		setVersion(t, "dev")
		setBuildConfig(t, "info:\n  version: \"0.7.0\"\n")
		if got := app.GetVersion(); got != "0.7.0" {
			t.Errorf("GetVersion() = %q, want 0.7.0", got)
		}
	})

	t.Run("dev build without config version", func(t *testing.T) {
		setVersion(t, "dev")
		setBuildConfig(t, "")
		if got := app.GetVersion(); got != "dev" {
			t.Errorf("GetVersion() = %q, want dev", got)
		}
	})
}

func TestConfigPaths(t *testing.T) {
	home := isolateHome(t)
	app := NewApp()

	if got, want := app.configPath(), filepath.Join(home, ".oso", "config.json"); got != want {
		t.Errorf("configPath() = %q, want %q", got, want)
	}
	if got, want := app.profilesPath(), filepath.Join(home, ".oso", "profiles.json"); got != want {
		t.Errorf("profilesPath() = %q, want %q", got, want)
	}
	if got, want := app.settingsPath(), filepath.Join(home, ".oso", "settings.json"); got != want {
		t.Errorf("settingsPath() = %q, want %q", got, want)
	}
}

func TestLoadConfigWithoutSavedConfig(t *testing.T) {
	isolateHome(t)
	app := NewApp()
	app.loadConfig()

	if app.IsConnected() {
		t.Error("expected no client without a saved config")
	}
	if app.GetSavedConfig() != nil {
		t.Error("expected a nil saved config")
	}
}

func TestLoadConfigIgnoresInvalidJSON(t *testing.T) {
	isolateHome(t)
	app := NewApp()
	if err := os.MkdirAll(app.configDir(), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(app.configPath(), []byte("{not json"), 0600); err != nil {
		t.Fatal(err)
	}

	app.loadConfig()

	if app.IsConnected() {
		t.Error("expected no client for an unreadable config")
	}
}

func TestLoadConfigPrefersEnvironment(t *testing.T) {
	isolateHome(t)
	saved := S3Config{Endpoint: "http://saved:9000", AccessKey: "saved", SecretKey: "saved", Region: "eu-west-1"}
	writeLegacyConfig(t, NewApp(), saved)
	t.Setenv("S3_ENDPOINT", "http://env:9000")
	t.Setenv("S3_ACCESS_KEY", "envkey")
	t.Setenv("S3_SECRET_KEY", "envsecret")

	app := NewApp()
	app.loadConfig()

	want := S3Config{Endpoint: "http://env:9000", AccessKey: "envkey", SecretKey: "envsecret", Region: "us-east-1"}
	if got := app.GetSavedConfig(); got == nil || *got != want {
		t.Errorf("GetSavedConfig() = %+v, want %+v", got, want)
	}
	if got := app.GetActiveProfileID(); got != envProfileID {
		t.Errorf("GetActiveProfileID() = %q, want %q", got, envProfileID)
	}
	// The environment profile is listed first and cannot be edited
	profiles := app.ListProfiles()
	if len(profiles) != 2 || profiles[0].ID != envProfileID || !profiles[0].ReadOnly || profiles[1].Endpoint != saved.Endpoint {
		t.Errorf("ListProfiles() = %+v, want the environment profile and the saved one", profiles)
	}
}

func TestLoadConfigNeedsAllEnvironmentCredentials(t *testing.T) {
	isolateHome(t)
	t.Setenv("S3_ENDPOINT", "http://env:9000")
	t.Setenv("S3_ACCESS_KEY", "envkey")

	app := NewApp()
	app.loadConfig()

	if app.IsConnected() {
		t.Error("expected no client when S3_SECRET_KEY is missing")
	}
}

func TestConnectWithConfigDefaultsRegion(t *testing.T) {
	app := NewApp()
	cfg := &S3Config{Endpoint: "http://localhost:9000", AccessKey: "key", SecretKey: "secret"}

	if err := app.connectWithConfig(cfg); err != nil {
		t.Fatalf("connectWithConfig: %v", err)
	}
	if cfg.Region != "us-east-1" {
		t.Errorf("Region = %q, want us-east-1", cfg.Region)
	}
	if app.presignClient == nil {
		t.Error("expected a presign client")
	}
}

// Non-AWS backends (MinIO, Garage) need path-style addressing and optional checksums
func TestConnectWithConfigKeepsCompatibilityOptions(t *testing.T) {
	app, fake := newConnectedApp(t)
	fake.put("my-bucket", "file.txt", "hello")

	// A virtual-hosted request would go to my-bucket.127.0.0.1 and never reach the fake
	result, err := app.ListObjects("my-bucket", "", "", 10)
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}
	if len(result.Objects) != 1 {
		t.Errorf("got %d objects, want 1", len(result.Objects))
	}
}

func TestConnect(t *testing.T) {
	isolateHome(t)
	_, srv := newFakeS3(t)
	app := NewApp()
	cfg := S3Config{Endpoint: srv.URL, AccessKey: "key", SecretKey: "secret", Region: "us-east-1"}

	if err := app.Connect(cfg); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	if !app.IsConnected() {
		t.Error("expected to be connected")
	}

	data, err := os.ReadFile(app.profilesPath())
	if err != nil {
		t.Fatalf("profiles were not saved: %v", err)
	}
	var saved profileStore
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatal(err)
	}
	if len(saved.Profiles) != 1 || saved.Profiles[0].config() != cfg || saved.ActiveID != saved.Profiles[0].ID {
		t.Errorf("saved profiles = %+v, want one active profile for %+v", saved, cfg)
	}
}

func TestConnectFailureClearsClient(t *testing.T) {
	isolateHome(t)
	fake, srv := newFakeS3(t)
	fake.deny = true
	app := NewApp()

	err := app.Connect(S3Config{Endpoint: srv.URL, AccessKey: "key", SecretKey: "bad", Region: "us-east-1"})

	if err == nil {
		t.Fatal("expected an error for rejected credentials")
	}
	if app.IsConnected() || app.GetSavedConfig() != nil {
		t.Error("expected the client and config to be cleared")
	}
	if _, statErr := os.Stat(app.profilesPath()); !os.IsNotExist(statErr) {
		t.Error("a failed connection must not save a profile")
	}
}

func TestDisconnect(t *testing.T) {
	app, _ := newConnectedApp(t)

	app.Disconnect()

	if app.IsConnected() {
		t.Error("expected to be disconnected")
	}
	if _, err := app.ListBuckets(); err == nil {
		t.Error("expected ListBuckets to fail after Disconnect")
	}
}
