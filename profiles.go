package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// EventProfilesChanged tells every window that the profile list or the active
// connection changed
const EventProfilesChanged = "profiles:changed"

// envProfileID identifies the connection built from the S3_* environment
// variables. It is listed with the saved profiles but never written to disk.
const envProfileID = "env"

// ConnectionProfile is one saved S3 account
type ConnectionProfile struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Endpoint  string `json:"endpoint"`
	AccessKey string `json:"accessKey"`
	SecretKey string `json:"secretKey"`
	Region    string `json:"region"`
	// ReadOnly marks the environment profile, which cannot be edited or deleted
	ReadOnly bool `json:"readOnly"`
}

// ProfilesChangedEvent carries the connection state after a profile change
type ProfilesChangedEvent struct {
	ActiveID  string `json:"activeId"`
	Connected bool   `json:"connected"`
}

// profileStore is the layout of ~/.oso/profiles.json
type profileStore struct {
	ActiveID string              `json:"activeId"`
	Profiles []ConnectionProfile `json:"profiles"`
}

func (p ConnectionProfile) config() S3Config {
	return S3Config{Endpoint: p.Endpoint, AccessKey: p.AccessKey, SecretKey: p.SecretKey, Region: p.Region}
}

func newProfileID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// defaultProfileName names a profile after the host of its endpoint
func defaultProfileName(endpoint string) string {
	if u, err := url.Parse(endpoint); err == nil && u.Host != "" {
		return u.Host
	}
	return endpoint
}

// loadProfiles reads profiles.json. Installs from before profiles existed have
// a single config.json, which becomes the first profile.
func (a *App) loadProfiles() {
	a.profiles = nil
	a.activeProfileID = ""

	if data, err := os.ReadFile(a.profilesPath()); err == nil {
		var store profileStore
		if json.Unmarshal(data, &store) == nil {
			a.profiles = store.Profiles
			a.activeProfileID = store.ActiveID
		}
		return
	}

	data, err := os.ReadFile(a.configPath())
	if err != nil {
		return
	}
	var cfg S3Config
	if json.Unmarshal(data, &cfg) != nil || cfg.Endpoint == "" {
		return
	}
	profile := ConnectionProfile{
		ID:        newProfileID(),
		Name:      defaultProfileName(cfg.Endpoint),
		Endpoint:  cfg.Endpoint,
		AccessKey: cfg.AccessKey,
		SecretKey: cfg.SecretKey,
		Region:    cfg.Region,
	}
	a.profiles = []ConnectionProfile{profile}
	a.activeProfileID = profile.ID
	_ = a.saveProfiles()
}

// saveProfiles writes the profiles to disk. The environment profile is not
// stored, so it is not remembered as the active one either.
func (a *App) saveProfiles() error {
	if err := os.MkdirAll(a.configDir(), 0700); err != nil {
		return err
	}
	store := profileStore{ActiveID: a.activeProfileID, Profiles: a.profiles}
	if store.ActiveID == envProfileID {
		store.ActiveID = ""
	}
	if store.Profiles == nil {
		store.Profiles = []ConnectionProfile{}
	}
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.profilesPath(), data, 0600)
}

func (a *App) findProfile(id string) (ConnectionProfile, bool) {
	if id == "" {
		return ConnectionProfile{}, false
	}
	if id == envProfileID && a.envProfile != nil {
		return *a.envProfile, true
	}
	for _, p := range a.profiles {
		if p.ID == id {
			return p, true
		}
	}
	return ConnectionProfile{}, false
}

func (a *App) emitProfilesChanged() {
	emit(EventProfilesChanged, ProfilesChangedEvent{ActiveID: a.activeProfileID, Connected: a.s3Client != nil})
}

// connectVerified builds clients for cfg and checks that the server accepts
// them. The current connection is only replaced when that check passes.
func (a *App) connectVerified(cfg S3Config) error {
	client, presign, err := newS3Clients(&cfg)
	if err != nil {
		return err
	}
	if _, err := client.ListBuckets(context.TODO(), &s3.ListBucketsInput{}); err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}
	a.s3Client = client
	a.presignClient = presign
	a.appConfig = &cfg
	return nil
}

// ListProfiles returns the saved profiles, preceded by the environment
// profile when the app was configured through S3_* variables
func (a *App) ListProfiles() []ConnectionProfile {
	a.mu.Lock()
	defer a.mu.Unlock()

	profiles := make([]ConnectionProfile, 0, len(a.profiles)+1)
	if a.envProfile != nil {
		profiles = append(profiles, *a.envProfile)
	}
	return append(profiles, a.profiles...)
}

// GetActiveProfileID returns the ID of the connected profile, or an empty string
func (a *App) GetActiveProfileID() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.activeProfileID
}

// TestConnection checks a configuration without changing the active connection
func (a *App) TestConnection(cfg S3Config) error {
	client, _, err := newS3Clients(&cfg)
	if err != nil {
		return err
	}
	if _, err := client.ListBuckets(context.TODO(), &s3.ListBucketsInput{}); err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}
	return nil
}

// Connect verifies a configuration, saves it as a profile and makes it the
// active connection. A profile with the same endpoint and access key is reused.
func (a *App) Connect(cfg S3Config) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if err := a.connectVerified(cfg); err != nil {
		return err
	}
	cfg = *a.appConfig

	index := -1
	for i, p := range a.profiles {
		if p.Endpoint == cfg.Endpoint && p.AccessKey == cfg.AccessKey {
			index = i
			break
		}
	}
	if index < 0 {
		a.profiles = append(a.profiles, ConnectionProfile{ID: newProfileID(), Name: defaultProfileName(cfg.Endpoint)})
		index = len(a.profiles) - 1
	}
	profile := &a.profiles[index]
	profile.Endpoint, profile.AccessKey, profile.SecretKey, profile.Region = cfg.Endpoint, cfg.AccessKey, cfg.SecretKey, cfg.Region
	a.activeProfileID = profile.ID

	err := a.saveProfiles()
	a.emitProfilesChanged()
	return err
}

// SaveProfile creates a profile (empty ID) or updates an existing one. Changes
// to the active profile are verified first and take effect immediately.
func (a *App) SaveProfile(profile ConnectionProfile) (ConnectionProfile, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	profile.Name = strings.TrimSpace(profile.Name)
	profile.Endpoint = strings.TrimSpace(profile.Endpoint)
	profile.AccessKey = strings.TrimSpace(profile.AccessKey)
	profile.Region = strings.TrimSpace(profile.Region)
	profile.ReadOnly = false
	if profile.ID == envProfileID {
		return ConnectionProfile{}, fmt.Errorf("the environment profile cannot be changed")
	}
	if profile.Endpoint == "" || profile.AccessKey == "" || profile.SecretKey == "" {
		return ConnectionProfile{}, fmt.Errorf("endpoint, access key and secret key are required")
	}
	if profile.Name == "" {
		profile.Name = defaultProfileName(profile.Endpoint)
	}
	if profile.Region == "" {
		profile.Region = "us-east-1"
	}

	if profile.ID == "" {
		profile.ID = newProfileID()
		a.profiles = append(a.profiles, profile)
	} else {
		index := -1
		for i, p := range a.profiles {
			if p.ID == profile.ID {
				index = i
				break
			}
		}
		if index < 0 {
			return ConnectionProfile{}, fmt.Errorf("profile not found")
		}
		if profile.ID == a.activeProfileID {
			if err := a.connectVerified(profile.config()); err != nil {
				return ConnectionProfile{}, err
			}
		}
		a.profiles[index] = profile
	}

	err := a.saveProfiles()
	a.emitProfilesChanged()
	return profile, err
}

// DeleteProfile removes a saved profile; deleting the active one disconnects
func (a *App) DeleteProfile(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if id == envProfileID {
		return fmt.Errorf("the environment profile cannot be deleted")
	}
	index := -1
	for i, p := range a.profiles {
		if p.ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		return fmt.Errorf("profile not found")
	}
	a.profiles = append(a.profiles[:index], a.profiles[index+1:]...)
	if id == a.activeProfileID {
		a.clearConnection()
	}

	err := a.saveProfiles()
	a.emitProfilesChanged()
	return err
}

// SwitchProfile connects to another profile. When the new connection fails,
// the current one stays in place.
func (a *App) SwitchProfile(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	profile, ok := a.findProfile(id)
	if !ok {
		return fmt.Errorf("profile not found")
	}
	if err := a.connectVerified(profile.config()); err != nil {
		return err
	}
	a.activeProfileID = profile.ID

	err := a.saveProfiles()
	a.emitProfilesChanged()
	return err
}

func (a *App) clearConnection() {
	a.s3Client = nil
	a.presignClient = nil
	a.appConfig = nil
	a.activeProfileID = ""
}

// Disconnect clears the active S3 connection. The profiles stay saved, and the
// app starts disconnected until one is chosen again.
func (a *App) Disconnect() {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.clearConnection()
	_ = a.saveProfiles()
	a.emitProfilesChanged()
}
