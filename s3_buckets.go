package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// ListBuckets returns all S3 buckets
func (a *App) ListBuckets() ([]Bucket, error) {
	if a.s3Client == nil {
		return nil, fmt.Errorf("not connected to S3")
	}

	result, err := a.s3Client.ListBuckets(context.TODO(), &s3.ListBucketsInput{})
	if err != nil {
		return nil, err
	}

	buckets := make([]Bucket, 0, len(result.Buckets))
	for _, b := range result.Buckets {
		bucket := Bucket{Name: aws.ToString(b.Name)}
		if b.CreationDate != nil {
			bucket.CreationDate = b.CreationDate.Format(time.RFC3339)
		}
		buckets = append(buckets, bucket)
	}
	return buckets, nil
}

// CreateBucket creates a new S3 bucket after validating the name
func (a *App) CreateBucket(name string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}

	// Validate bucket name (S3 naming rules)
	name = strings.TrimSpace(name)
	if len(name) < 3 || len(name) > 63 {
		return fmt.Errorf("bucket name must be between 3 and 63 characters")
	}
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.') {
			return fmt.Errorf("bucket name can only contain lowercase letters, numbers, hyphens, and dots")
		}
	}
	if name[0] == '-' || name[0] == '.' || name[len(name)-1] == '-' || name[len(name)-1] == '.' {
		return fmt.Errorf("bucket name must start and end with a letter or number")
	}
	if strings.Contains(name, "..") {
		return fmt.Errorf("bucket name must not contain consecutive dots")
	}

	_, err := a.s3Client.CreateBucket(context.TODO(), &s3.CreateBucketInput{
		Bucket: aws.String(name),
	})
	if err != nil {
		return fmt.Errorf("failed to create bucket: %w", err)
	}
	return nil
}
