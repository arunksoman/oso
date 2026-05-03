package main

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// DeleteObject deletes a single S3 object
func (a *App) DeleteObject(bucket, key string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	_, err := a.s3Client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}

// DeleteObjects deletes multiple S3 objects one by one (compatible with all S3 backends)
func (a *App) DeleteObjects(bucket string, keys []string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	for _, k := range keys {
		if err := a.DeleteObject(bucket, k); err != nil {
			return err
		}
	}
	return nil
}

// DeleteFolder recursively deletes all objects under a prefix
func (a *App) DeleteFolder(bucket, prefix string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	var continuationToken *string
	for {
		input := &s3.ListObjectsV2Input{
			Bucket: aws.String(bucket),
			Prefix: aws.String(prefix),
		}
		if continuationToken != nil {
			input.ContinuationToken = continuationToken
		}
		result, err := a.s3Client.ListObjectsV2(context.TODO(), input)
		if err != nil {
			return err
		}
		if len(result.Contents) > 0 {
			keys := make([]string, len(result.Contents))
			for i, obj := range result.Contents {
				keys[i] = aws.ToString(obj.Key)
			}
			if err := a.DeleteObjects(bucket, keys); err != nil {
				return err
			}
		}
		if !aws.ToBool(result.IsTruncated) {
			break
		}
		continuationToken = result.NextContinuationToken
	}
	return nil
}

// CopyObject copies an object from src to dst
func (a *App) CopyObject(srcBucket, srcKey, dstBucket, dstKey string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	// URL-encode each segment of the key for S3-compatible backends
	parts := strings.Split(srcKey, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	copySource := fmt.Sprintf("%s/%s", srcBucket, strings.Join(parts, "/"))
	_, err := a.s3Client.CopyObject(context.TODO(), &s3.CopyObjectInput{
		Bucket:     aws.String(dstBucket),
		Key:        aws.String(dstKey),
		CopySource: aws.String(copySource),
	})
	return err
}

// MoveObject moves an object (copy + delete)
func (a *App) MoveObject(srcBucket, srcKey, dstBucket, dstKey string) error {
	if err := a.CopyObject(srcBucket, srcKey, dstBucket, dstKey); err != nil {
		return err
	}
	return a.DeleteObject(srcBucket, srcKey)
}

// CopyFolder recursively copies all objects under a prefix to a new destination
func (a *App) CopyFolder(srcBucket, srcPrefix, dstBucket, dstPrefix string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}
	var continuationToken *string
	for {
		input := &s3.ListObjectsV2Input{
			Bucket: aws.String(srcBucket),
			Prefix: aws.String(srcPrefix),
		}
		if continuationToken != nil {
			input.ContinuationToken = continuationToken
		}
		result, err := a.s3Client.ListObjectsV2(context.TODO(), input)
		if err != nil {
			return err
		}
		for _, obj := range result.Contents {
			srcKey := aws.ToString(obj.Key)
			// Replace the source prefix with the destination prefix
			relKey := strings.TrimPrefix(srcKey, srcPrefix)
			dstKey := dstPrefix + relKey
			if err := a.CopyObject(srcBucket, srcKey, dstBucket, dstKey); err != nil {
				return fmt.Errorf("failed to copy %s: %w", srcKey, err)
			}
		}
		if !aws.ToBool(result.IsTruncated) {
			break
		}
		continuationToken = result.NextContinuationToken
	}
	return nil
}

// MoveFolder recursively moves all objects under a prefix (copy + delete)
func (a *App) MoveFolder(srcBucket, srcPrefix, dstBucket, dstPrefix string) error {
	if err := a.CopyFolder(srcBucket, srcPrefix, dstBucket, dstPrefix); err != nil {
		return err
	}
	return a.DeleteFolder(srcBucket, srcPrefix)
}
