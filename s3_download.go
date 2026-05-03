package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// DownloadObject downloads an S3 object to a local path
func (a *App) DownloadObject(bucket, key, destPath string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	result, err := a.s3Client.GetObject(context.TODO(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return err
	}
	defer result.Body.Close()

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return err
	}
	f, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, result.Body)
	return err
}

// GetPresignedURL generates a presigned download URL for an S3 object
func (a *App) GetPresignedURL(bucket, key string, expirySeconds int) (string, error) {
	if a.presignClient == nil {
		return "", fmt.Errorf("not connected to S3")
	}
	result, err := a.presignClient.PresignGetObject(context.TODO(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = time.Duration(expirySeconds) * time.Second
	})
	if err != nil {
		return "", err
	}
	return result.URL, nil
}

// CreateFolder creates an S3 folder marker
func (a *App) CreateFolder(bucket, prefix, folderName string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	key := prefix + folderName + "/"
	_, err := a.s3Client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}
