package main

import (
	_ "embed"

	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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

func (a *App) loadConfig() {
	endpoint := os.Getenv("S3_ENDPOINT")
	accessKey := os.Getenv("S3_ACCESS_KEY")
	secretKey := os.Getenv("S3_SECRET_KEY")
	region := os.Getenv("S3_REGION")

	if endpoint != "" && accessKey != "" && secretKey != "" {
		if region == "" {
			region = "us-east-1"
		}
		cfg := &S3Config{
			Endpoint:  endpoint,
			AccessKey: accessKey,
			SecretKey: secretKey,
			Region:    region,
		}
		_ = a.connectWithConfig(cfg)
		return
	}

	data, err := os.ReadFile(a.configPath())
	if err != nil {
		return
	}
	var cfg S3Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return
	}
	a.appConfig = &cfg
	_ = a.connectWithConfig(&cfg)
}

func (a *App) connectWithConfig(cfg *S3Config) error {
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
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
		o.UsePathStyle = true
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})

	a.s3Client = client
	a.presignClient = s3.NewPresignClient(client)
	a.appConfig = cfg
	return nil
}

// GetSavedConfig returns the saved S3 configuration
func (a *App) GetSavedConfig() *S3Config {
	return a.appConfig
}

// Connect connects to S3 with the given configuration and tests it
func (a *App) Connect(cfg S3Config) error {
	if err := a.connectWithConfig(&cfg); err != nil {
		return err
	}

	_, err := a.s3Client.ListBuckets(context.TODO(), &s3.ListBucketsInput{})
	if err != nil {
		a.s3Client = nil
		a.presignClient = nil
		a.appConfig = nil
		return fmt.Errorf("connection failed: %w", err)
	}

	return a.SaveConfig(cfg)
}

// SaveConfig persists the S3 config to disk
func (a *App) SaveConfig(cfg S3Config) error {
	if err := os.MkdirAll(a.configDir(), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath(), data, 0600)
}

// Disconnect clears the active S3 connection
func (a *App) Disconnect() {
	a.s3Client = nil
	a.presignClient = nil
}

// IsConnected returns true if currently connected to S3
func (a *App) IsConnected() bool {
	return a.s3Client != nil
}
