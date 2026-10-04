package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// newProfileApp returns a disconnected App with an isolated home and a fake S3 to connect to
func newProfileApp(t *testing.T) (*App, *fakeS3, string) {
	t.Helper()
	isolateHome(t)
	fake, srv := newFakeS3(t)
	return NewApp(), fake, srv.URL
}

func mustSaveProfile(t *testing.T, app *App, profile ConnectionProfile) ConnectionProfile {
	t.Helper()
	saved, err := app.SaveProfile(profile)
	if err != nil {
		t.Fatalf("SaveProfile: %v", err)
	}
	return saved
}

func readProfileStore(t *testing.T, app *App) profileStore {
	t.Helper()
	data, err := os.ReadFile(app.profilesPath())
	if err != nil {
		t.Fatalf("profiles.json: %v", err)
	}
	var store profileStore
	if err := json.Unmarshal(data, &store); err != nil {
		t.Fatal(err)
	}
	return store
}

func TestDefaultProfileName(t *testing.T) {
	tests := map[string]string{
		"http://localhost:9000":    "localhost:9000",
		"https://s3.amazonaws.com": "s3.amazonaws.com",
		"not a url":                "not a url",
		"://broken":                "://broken",
	}
	for endpoint, want := range tests {
		if got := defaultProfileName(endpoint); got != want {
			t.Errorf("defaultProfileName(%q) = %q, want %q", endpoint, got, want)
		}
	}
}

func TestLegacyConfigBecomesFirstProfile(t *testing.T) {
	isolateHome(t)
	cfg := S3Config{Endpoint: "http://localhost:9000", AccessKey: "key", SecretKey: "secret", Region: "eu-west-1"}
	writeLegacyConfig(t, NewApp(), cfg)

	app := NewApp()
	app.loadConfig()

	if !app.IsConnected() {
		t.Fatal("expected a client after migrating the saved config")
	}
	if got := app.GetSavedConfig(); got == nil || *got != cfg {
		t.Errorf("GetSavedConfig() = %+v, want %+v", got, cfg)
	}
	profiles := app.ListProfiles()
	if len(profiles) != 1 || profiles[0].Name != "localhost:9000" || profiles[0].config() != cfg {
		t.Fatalf("ListProfiles() = %+v, want one profile for %+v", profiles, cfg)
	}
	if app.GetActiveProfileID() != profiles[0].ID {
		t.Error("the migrated profile should be active")
	}

	// The migration is written out, so the next start reads profiles.json
	store := readProfileStore(t, app)
	if len(store.Profiles) != 1 || store.ActiveID != profiles[0].ID {
		t.Errorf("profiles.json = %+v, want the migrated profile", store)
	}
	again := NewApp()
	again.loadConfig()
	if got := again.ListProfiles(); len(got) != 1 || got[0].ID != profiles[0].ID {
		t.Errorf("profiles after restart = %+v, want the same profile", got)
	}
}

func TestLegacyConfigWithoutEndpointIsIgnored(t *testing.T) {
	isolateHome(t)
	writeLegacyConfig(t, NewApp(), S3Config{AccessKey: "key"})

	app := NewApp()
	app.loadConfig()

	if app.IsConnected() || len(app.ListProfiles()) != 0 {
		t.Error("an empty legacy config must not become a profile")
	}
}

func TestLoadProfilesIgnoresInvalidJSON(t *testing.T) {
	isolateHome(t)
	app := NewApp()
	if err := os.MkdirAll(app.configDir(), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(app.profilesPath(), []byte("{not json"), 0600); err != nil {
		t.Fatal(err)
	}

	app.loadConfig()

	if app.IsConnected() || len(app.ListProfiles()) != 0 {
		t.Error("expected no profiles for an unreadable profiles.json")
	}
}

func TestLoadConfigDropsUnknownActiveProfile(t *testing.T) {
	isolateHome(t)
	app := NewApp()
	app.profiles = []ConnectionProfile{{ID: "a", Name: "A", Endpoint: "http://a:9000", AccessKey: "k", SecretKey: "s"}}
	app.activeProfileID = "gone"
	if err := app.saveProfiles(); err != nil {
		t.Fatal(err)
	}

	restarted := NewApp()
	restarted.loadConfig()

	if restarted.IsConnected() || restarted.GetActiveProfileID() != "" {
		t.Error("an active ID without a profile must leave the app disconnected")
	}
	if len(restarted.ListProfiles()) != 1 {
		t.Error("the saved profile should still be listed")
	}
}

func TestSaveProfileCreatesAndUpdates(t *testing.T) {
	app, _, endpoint := newProfileApp(t)

	created := mustSaveProfile(t, app, ConnectionProfile{
		Name: "  Work  ", Endpoint: " " + endpoint + " ", AccessKey: " key ", SecretKey: "secret", ReadOnly: true,
	})
	if created.ID == "" || created.Name != "Work" || created.Endpoint != endpoint || created.AccessKey != "key" {
		t.Errorf("created profile = %+v, want trimmed fields and a new ID", created)
	}
	if created.Region != "us-east-1" || created.ReadOnly {
		t.Errorf("created profile = %+v, want the default region and not read-only", created)
	}
	// Saving a profile does not connect to it
	if app.IsConnected() || app.GetActiveProfileID() != "" {
		t.Error("saving a new profile must not change the connection")
	}

	created.Name = "Renamed"
	created.Region = "eu-west-1"
	updated := mustSaveProfile(t, app, created)
	if updated.ID != created.ID {
		t.Errorf("update changed the ID: %q -> %q", created.ID, updated.ID)
	}

	store := readProfileStore(t, app)
	if len(store.Profiles) != 1 || store.Profiles[0].Name != "Renamed" || store.Profiles[0].Region != "eu-west-1" {
		t.Errorf("profiles.json = %+v, want the renamed profile", store)
	}
}

func TestSaveProfileNamesAfterEndpoint(t *testing.T) {
	app, _, _ := newProfileApp(t)

	saved := mustSaveProfile(t, app, ConnectionProfile{Endpoint: "https://s3.example.com", AccessKey: "key", SecretKey: "secret"})

	if saved.Name != "s3.example.com" {
		t.Errorf("Name = %q, want s3.example.com", saved.Name)
	}
}

func TestSaveProfileValidation(t *testing.T) {
	app, _, endpoint := newProfileApp(t)
	valid := ConnectionProfile{Name: "A", Endpoint: endpoint, AccessKey: "key", SecretKey: "secret"}

	tests := []struct {
		name    string
		change  func(*ConnectionProfile)
		wantErr string
	}{
		{"missing endpoint", func(p *ConnectionProfile) { p.Endpoint = " " }, "are required"},
		{"missing access key", func(p *ConnectionProfile) { p.AccessKey = "" }, "are required"},
		{"missing secret key", func(p *ConnectionProfile) { p.SecretKey = "" }, "are required"},
		{"environment profile", func(p *ConnectionProfile) { p.ID = envProfileID }, "cannot be changed"},
		{"unknown profile", func(p *ConnectionProfile) { p.ID = "missing" }, "profile not found"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profile := valid
			tt.change(&profile)
			if _, err := app.SaveProfile(profile); err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("err = %v, want one containing %q", err, tt.wantErr)
			}
		})
	}
	if len(app.ListProfiles()) != 0 {
		t.Error("rejected profiles must not be saved")
	}
}

func TestSwitchProfile(t *testing.T) {
	app, fake, endpoint := newProfileApp(t)
	fake.put("first-bucket", "a.txt", "a")
	_, other := newFakeS3(t)
	first := mustSaveProfile(t, app, ConnectionProfile{Name: "First", Endpoint: endpoint, AccessKey: "key", SecretKey: "secret"})
	second := mustSaveProfile(t, app, ConnectionProfile{Name: "Second", Endpoint: other.URL, AccessKey: "key", SecretKey: "secret"})

	if err := app.SwitchProfile(first.ID); err != nil {
		t.Fatalf("SwitchProfile: %v", err)
	}
	if buckets, err := app.ListBuckets(); err != nil || len(buckets) != 1 {
		t.Errorf("ListBuckets() = (%v, %v), want the bucket of the first server", buckets, err)
	}

	if err := app.SwitchProfile(second.ID); err != nil {
		t.Fatalf("SwitchProfile: %v", err)
	}
	if buckets, err := app.ListBuckets(); err != nil || len(buckets) != 0 {
		t.Errorf("ListBuckets() = (%v, %v), want the empty second server", buckets, err)
	}
	if app.GetActiveProfileID() != second.ID || app.GetSavedConfig().Endpoint != other.URL {
		t.Error("the second profile should be active")
	}

	// The active profile is remembered for the next start
	restarted := NewApp()
	restarted.loadConfig()
	if !restarted.IsConnected() || restarted.GetActiveProfileID() != second.ID {
		t.Error("expected the app to reconnect to the last active profile")
	}
}

func TestSwitchProfileKeepsConnectionOnFailure(t *testing.T) {
	app, _, endpoint := newProfileApp(t)
	denied, deniedSrv := newFakeS3(t)
	denied.deny = true
	good := mustSaveProfile(t, app, ConnectionProfile{Name: "Good", Endpoint: endpoint, AccessKey: "key", SecretKey: "secret"})
	bad := mustSaveProfile(t, app, ConnectionProfile{Name: "Bad", Endpoint: deniedSrv.URL, AccessKey: "key", SecretKey: "wrong"})
	if err := app.SwitchProfile(good.ID); err != nil {
		t.Fatal(err)
	}

	if err := app.SwitchProfile(bad.ID); err == nil || !strings.Contains(err.Error(), "connection failed") {
		t.Errorf("err = %v, want a connection failure", err)
	}
	if err := app.SwitchProfile("missing"); err == nil {
		t.Error("expected an error for an unknown profile")
	}

	if app.GetActiveProfileID() != good.ID || app.GetSavedConfig().Endpoint != endpoint {
		t.Error("a failed switch must keep the working connection")
	}
	if _, err := app.ListBuckets(); err != nil {
		t.Errorf("ListBuckets after a failed switch: %v", err)
	}
}

func TestSaveActiveProfileReconnects(t *testing.T) {
	app, _, endpoint := newProfileApp(t)
	other, otherSrv := newFakeS3(t)
	other.put("other-bucket", "a.txt", "a")
	profile := mustSaveProfile(t, app, ConnectionProfile{Name: "Main", Endpoint: endpoint, AccessKey: "key", SecretKey: "secret"})
	if err := app.SwitchProfile(profile.ID); err != nil {
		t.Fatal(err)
	}

	profile.Endpoint = otherSrv.URL
	mustSaveProfile(t, app, profile)

	if buckets, err := app.ListBuckets(); err != nil || len(buckets) != 1 || buckets[0].Name != "other-bucket" {
		t.Errorf("ListBuckets() = (%v, %v), want the bucket of the new endpoint", buckets, err)
	}

	// Credentials the server rejects are not saved over working ones
	other.deny = true
	profile.SecretKey = "wrong"
	if _, err := app.SaveProfile(profile); err == nil {
		t.Fatal("expected the rejected credentials to be reported")
	}
	if got := readProfileStore(t, app).Profiles[0].SecretKey; got != "secret" {
		t.Errorf("saved secret = %q, want the working one", got)
	}
}

func TestDeleteProfile(t *testing.T) {
	app, _, endpoint := newProfileApp(t)
	active := mustSaveProfile(t, app, ConnectionProfile{Name: "Active", Endpoint: endpoint, AccessKey: "key", SecretKey: "secret"})
	spare := mustSaveProfile(t, app, ConnectionProfile{Name: "Spare", Endpoint: endpoint, AccessKey: "other", SecretKey: "secret"})
	if err := app.SwitchProfile(active.ID); err != nil {
		t.Fatal(err)
	}

	if err := app.DeleteProfile(spare.ID); err != nil {
		t.Fatalf("DeleteProfile: %v", err)
	}
	if !app.IsConnected() {
		t.Error("deleting another profile must keep the connection")
	}

	if err := app.DeleteProfile("missing"); err == nil {
		t.Error("expected an error for an unknown profile")
	}
	if err := app.DeleteProfile(envProfileID); err == nil {
		t.Error("expected an error for the environment profile")
	}

	if err := app.DeleteProfile(active.ID); err != nil {
		t.Fatalf("DeleteProfile: %v", err)
	}
	if app.IsConnected() || app.GetActiveProfileID() != "" || app.GetSavedConfig() != nil {
		t.Error("deleting the active profile must disconnect")
	}
	if store := readProfileStore(t, app); len(store.Profiles) != 0 || store.ActiveID != "" {
		t.Errorf("profiles.json = %+v, want it empty", store)
	}
}

func TestConnectReusesMatchingProfile(t *testing.T) {
	app, _, endpoint := newProfileApp(t)
	cfg := S3Config{Endpoint: endpoint, AccessKey: "key", SecretKey: "secret", Region: "us-east-1"}

	if err := app.Connect(cfg); err != nil {
		t.Fatal(err)
	}
	cfg.SecretKey = "rotated"
	if err := app.Connect(cfg); err != nil {
		t.Fatal(err)
	}

	profiles := app.ListProfiles()
	if len(profiles) != 1 || profiles[0].SecretKey != "rotated" {
		t.Errorf("ListProfiles() = %+v, want one profile with the new secret", profiles)
	}

	cfg.AccessKey = "another-account"
	if err := app.Connect(cfg); err != nil {
		t.Fatal(err)
	}
	if len(app.ListProfiles()) != 2 {
		t.Error("a different access key should create a second profile")
	}
}

func TestDisconnectKeepsProfiles(t *testing.T) {
	app, _, endpoint := newProfileApp(t)
	if err := app.Connect(S3Config{Endpoint: endpoint, AccessKey: "key", SecretKey: "secret"}); err != nil {
		t.Fatal(err)
	}

	app.Disconnect()

	if app.GetActiveProfileID() != "" || len(app.ListProfiles()) != 1 {
		t.Error("Disconnect should clear the active profile and keep the list")
	}
	restarted := NewApp()
	restarted.loadConfig()
	if restarted.IsConnected() {
		t.Error("the app must stay disconnected after a restart")
	}
}

func TestEnvironmentProfile(t *testing.T) {
	isolateHome(t)
	_, srv := newFakeS3(t)
	t.Setenv("S3_ENDPOINT", srv.URL)
	t.Setenv("S3_ACCESS_KEY", "envkey")
	t.Setenv("S3_SECRET_KEY", "envsecret")
	app := NewApp()
	app.loadConfig()
	saved := mustSaveProfile(t, app, ConnectionProfile{Name: "Saved", Endpoint: srv.URL, AccessKey: "key", SecretKey: "secret"})

	// The environment profile never reaches the profile file
	if store := readProfileStore(t, app); store.ActiveID != "" || len(store.Profiles) != 1 {
		t.Errorf("profiles.json = %+v, want only the saved profile and no active ID", store)
	}

	if err := app.SwitchProfile(saved.ID); err != nil {
		t.Fatal(err)
	}
	if err := app.SwitchProfile(envProfileID); err != nil {
		t.Fatalf("switching back to the environment profile: %v", err)
	}
	if app.GetSavedConfig().AccessKey != "envkey" {
		t.Error("expected the environment credentials to be active again")
	}
}

func TestTestConnection(t *testing.T) {
	app, fake, endpoint := newProfileApp(t)
	cfg := S3Config{Endpoint: endpoint, AccessKey: "key", SecretKey: "secret"}

	if err := app.TestConnection(cfg); err != nil {
		t.Errorf("TestConnection: %v", err)
	}
	if app.IsConnected() {
		t.Error("TestConnection must not connect the app")
	}

	fake.deny = true
	if err := app.TestConnection(cfg); err == nil || !strings.Contains(err.Error(), "connection failed") {
		t.Errorf("err = %v, want a connection failure", err)
	}
}
