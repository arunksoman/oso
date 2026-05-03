package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// ListObjects lists objects in a bucket with prefix-based filtering and pagination
func (a *App) ListObjects(bucket, prefix, continuationToken string, maxKeys int32) (*ListObjectsResult, error) {
	if a.s3Client == nil {
		return nil, fmt.Errorf("not connected to S3")
	}
	if maxKeys <= 0 {
		maxKeys = 100
	}

	input := &s3.ListObjectsV2Input{
		Bucket:    aws.String(bucket),
		Delimiter: aws.String("/"),
		MaxKeys:   aws.Int32(maxKeys),
	}
	if prefix != "" {
		input.Prefix = aws.String(prefix)
	}
	if continuationToken != "" {
		input.ContinuationToken = aws.String(continuationToken)
	}

	result, err := a.s3Client.ListObjectsV2(context.TODO(), input)
	if err != nil {
		return nil, err
	}

	objects := make([]S3Object, 0)

	// Folders first (common prefixes)
	for _, cp := range result.CommonPrefixes {
		p := aws.ToString(cp.Prefix)
		name := strings.TrimSuffix(p, "/")
		if idx := strings.LastIndex(name, "/"); idx >= 0 {
			name = name[idx+1:]
		}
		objects = append(objects, S3Object{
			Key:      p,
			Name:     name,
			IsFolder: true,
		})
	}

	// Then files
	for _, obj := range result.Contents {
		key := aws.ToString(obj.Key)
		if key == prefix {
			continue // skip folder marker itself
		}
		name := key
		if idx := strings.LastIndex(key, "/"); idx >= 0 {
			name = key[idx+1:]
		}
		if name == "" {
			continue
		}
		o := S3Object{
			Key:      key,
			Name:     name,
			Size:     aws.ToInt64(obj.Size),
			IsFolder: false,
		}
		if obj.LastModified != nil {
			o.LastModified = obj.LastModified.Format(time.RFC3339)
		}
		if obj.ETag != nil {
			o.ETag = strings.Trim(aws.ToString(obj.ETag), "\"")
		}
		objects = append(objects, o)
	}

	nextToken := ""
	if result.NextContinuationToken != nil {
		nextToken = aws.ToString(result.NextContinuationToken)
	}

	return &ListObjectsResult{
		Objects:               objects,
		NextContinuationToken: nextToken,
		HasMore:               aws.ToBool(result.IsTruncated),
	}, nil
}

// SearchObjects searches immediate children under a prefix across all paginated pages.
// Results are folder-first and capped by maxResults for responsiveness.
func (a *App) SearchObjects(bucket, prefix, query string, maxResults int32) ([]S3Object, error) {
	if a.s3Client == nil {
		return nil, fmt.Errorf("not connected to S3")
	}

	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return []S3Object{}, nil
	}
	if maxResults <= 0 {
		maxResults = 1000
	}

	folders := make([]S3Object, 0)
	files := make([]S3Object, 0)
	folderSeen := make(map[string]struct{})

	var continuationToken *string
	for {
		input := &s3.ListObjectsV2Input{
			Bucket:    aws.String(bucket),
			Delimiter: aws.String("/"),
			Prefix:    aws.String(prefix),
			MaxKeys:   aws.Int32(1000),
		}
		if continuationToken != nil {
			input.ContinuationToken = continuationToken
		}

		result, err := a.s3Client.ListObjectsV2(context.TODO(), input)
		if err != nil {
			return nil, err
		}

		for _, cp := range result.CommonPrefixes {
			p := aws.ToString(cp.Prefix)
			name := strings.TrimSuffix(p, "/")
			if idx := strings.LastIndex(name, "/"); idx >= 0 {
				name = name[idx+1:]
			}
			if name == "" {
				continue
			}
			if !strings.Contains(strings.ToLower(name), q) {
				continue
			}
			if _, exists := folderSeen[p]; exists {
				continue
			}
			folderSeen[p] = struct{}{}
			folders = append(folders, S3Object{
				Key:      p,
				Name:     name,
				IsFolder: true,
			})
			if int32(len(folders)+len(files)) >= maxResults {
				results := append(folders, files...)
				return results, nil
			}
		}

		for _, obj := range result.Contents {
			key := aws.ToString(obj.Key)
			if key == prefix {
				continue
			}
			name := key
			if idx := strings.LastIndex(key, "/"); idx >= 0 {
				name = key[idx+1:]
			}
			if name == "" {
				continue
			}
			if !strings.Contains(strings.ToLower(name), q) {
				continue
			}

			file := S3Object{
				Key:      key,
				Name:     name,
				Size:     aws.ToInt64(obj.Size),
				IsFolder: false,
			}
			if obj.LastModified != nil {
				file.LastModified = obj.LastModified.Format(time.RFC3339)
			}
			if obj.ETag != nil {
				file.ETag = strings.Trim(aws.ToString(obj.ETag), "\"")
			}
			files = append(files, file)
			if int32(len(folders)+len(files)) >= maxResults {
				results := append(folders, files...)
				return results, nil
			}
		}

		if !aws.ToBool(result.IsTruncated) {
			break
		}
		continuationToken = result.NextContinuationToken
	}

	results := append(folders, files...)
	return results, nil
}
