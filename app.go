package main

import (
	_ "embed"

	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// version is set at build time via -ldflags "-X main.version=x.y.z"
var version = "dev"

//go:embed build/config.yml
var buildConfig []byte

// App is the Wails service exposing all S3 operations to the frontend
type App struct {
	s3Client      *s3.Client
	presignClient *s3.PresignClient
	appConfig     *S3Config

	// Connection profiles; mu guards them and the profile file
	mu              sync.Mutex
	profiles        []ConnectionProfile
	activeProfileID string
	envProfile      *ConnectionProfile
}

// S3Config holds S3 connection configuration
type S3Config struct {
	Endpoint  string `json:"endpoint"`
	AccessKey string `json:"accessKey"`
	SecretKey string `json:"secretKey"`
	Region    string `json:"region"`
}

// AppSettings holds application settings
type AppSettings struct {
	DefaultDownloadPath string `json:"defaultDownloadPath"`
	AskBeforeDownload   bool   `json:"askBeforeDownload"`
	ShowFileDetails     bool   `json:"showFileDetails"`
	PageSize            int32  `json:"pageSize"`
	Theme               string `json:"theme"`
}

// Bucket represents an S3 bucket
type Bucket struct {
	Name         string `json:"name"`
	CreationDate string `json:"creationDate"`
}

// S3Object represents a file or folder in S3
type S3Object struct {
	Key          string `json:"key"`
	Name         string `json:"name"`
	Size         int64  `json:"size"`
	LastModified string `json:"lastModified"`
	IsFolder     bool   `json:"isFolder"`
	ETag         string `json:"etag"`
}

// ListObjectsResult holds paginated listing results
type ListObjectsResult struct {
	Objects               []S3Object `json:"objects"`
	NextContinuationToken string     `json:"nextContinuationToken"`
	HasMore               bool       `json:"hasMore"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// GetVersion returns the app version
func (a *App) GetVersion() string {
	if version != "dev" {
		return version
	}
	if v := configVersion(); v != "" {
		return v
	}
	return version
}

// configVersion reads the version from the embedded build/config.yml,
// preferring info.displayVersion (may carry a pre-release suffix) over
// the numeric info.version used for OS package metadata.
func configVersion() string {
	values := map[string]string{}
	inInfo := false
	scanner := bufio.NewScanner(bytes.NewReader(buildConfig))
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, " ") {
			inInfo = strings.HasPrefix(line, "info:")
			continue
		}
		key, value, ok := strings.Cut(strings.TrimSpace(line), ":")
		if !inInfo || !ok || (key != "version" && key != "displayVersion") {
			continue
		}
		if i := strings.Index(value, "#"); i >= 0 {
			value = value[:i]
		}
		values[key] = strings.Trim(strings.TrimSpace(value), `"'`)
	}
	if v := values["displayVersion"]; v != "" {
		return v
	}
	return values["version"]
}

// ServiceStartup is called by Wails when the application starts
func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	a.loadConfig()
	return nil
}

func (a *App) configDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".oso")
}

func (a *App) configPath() string {
	return filepath.Join(a.configDir(), "config.json")
}

func (a *App) settingsPath() string {
	return filepath.Join(a.configDir(), "settings.json")
}

func (a *App) profilesPath() string {
	return filepath.Join(a.configDir(), "profiles.json")
}

// loadConfig restores the saved profiles and connects: environment variables
// first, then the profile that was active when the app last closed.
func (a *App) loadConfig() {
	a.loadProfiles()

	endpoint := os.Getenv("S3_ENDPOINT")
	accessKey := os.Getenv("S3_ACCESS_KEY")
	secretKey := os.Getenv("S3_SECRET_KEY")
	region := os.Getenv("S3_REGION")

	if endpoint != "" && accessKey != "" && secretKey != "" {
		if region == "" {
			region = "us-east-1"
		}
		a.envProfile = &ConnectionProfile{
			ID:        envProfileID,
			Name:      "Environment",
			Endpoint:  endpoint,
			AccessKey: accessKey,
			SecretKey: secretKey,
			Region:    region,
			ReadOnly:  true,
		}
		cfg := a.envProfile.config()
		_ = a.connectWithConfig(&cfg)
		a.activeProfileID = envProfileID
		return
	}

	profile, ok := a.findProfile(a.activeProfileID)
	if !ok {
		a.activeProfileID = ""
		return
	}
	cfg := profile.config()
	_ = a.connectWithConfig(&cfg)
}

// newS3Clients builds the S3 and presign clients for a configuration
func newS3Clients(cfg *S3Config) (*s3.Client, *s3.PresignClient, error) {
	if cfg.Region == "" {
		cfg.Region = "us-east-1"
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.TODO(),
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		),
	)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
		o.UsePathStyle = true
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})
	return client, s3.NewPresignClient(client), nil
}

func (a *App) connectWithConfig(cfg *S3Config) error {
	client, presign, err := newS3Clients(cfg)
	if err != nil {
		return err
	}
	a.s3Client = client
	a.presignClient = presign
	a.appConfig = cfg
	return nil
}

// GetSavedConfig returns the configuration of the active connection
func (a *App) GetSavedConfig() *S3Config {
	return a.appConfig
}

// IsConnected returns true if currently connected to S3
func (a *App) IsConnected() bool {
	return a.s3Client != nil
}
