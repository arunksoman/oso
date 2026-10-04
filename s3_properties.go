package main

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// maxCopyInPlaceSize is the largest object a single CopyObject call accepts
const maxCopyInPlaceSize = 5 * 1024 * 1024 * 1024

// ObjectProperties holds the HeadObject details and tags of one object
type ObjectProperties struct {
	Bucket             string            `json:"bucket"`
	Key                string            `json:"key"`
	Size               int64             `json:"size"`
	LastModified       string            `json:"lastModified"`
	ContentType        string            `json:"contentType"`
	ETag               string            `json:"etag"`
	StorageClass       string            `json:"storageClass"`
	VersionID          string            `json:"versionId"`
	CacheControl       string            `json:"cacheControl"`
	ContentDisposition string            `json:"contentDisposition"`
	ContentEncoding    string            `json:"contentEncoding"`
	Metadata           map[string]string `json:"metadata"`
	Tags               map[string]string `json:"tags"`
}

// copySourcePath builds the CopySource value, URL-encoding each segment of
// the key for S3-compatible backends
func copySourcePath(bucket, key string) string {
	parts := strings.Split(key, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	return fmt.Sprintf("%s/%s", bucket, strings.Join(parts, "/"))
}

// GetObjectProperties returns the metadata of an object. Tags are optional:
// backends without tagging support simply report none.
func (a *App) GetObjectProperties(bucket, key string) (*ObjectProperties, error) {
	if a.s3Client == nil {
		return nil, fmt.Errorf("not connected to S3")
	}
	head, err := a.s3Client.HeadObject(context.TODO(), &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}

	props := &ObjectProperties{
		Bucket:             bucket,
		Key:                key,
		Size:               aws.ToInt64(head.ContentLength),
		ContentType:        aws.ToString(head.ContentType),
		ETag:               strings.Trim(aws.ToString(head.ETag), "\""),
		StorageClass:       string(head.StorageClass),
		VersionID:          aws.ToString(head.VersionId),
		CacheControl:       aws.ToString(head.CacheControl),
		ContentDisposition: aws.ToString(head.ContentDisposition),
		ContentEncoding:    aws.ToString(head.ContentEncoding),
		Metadata:           map[string]string{},
		Tags:               map[string]string{},
	}
	if head.LastModified != nil {
		props.LastModified = head.LastModified.Format(time.RFC3339)
	}
	// S3 omits the storage class header for STANDARD objects
	if props.StorageClass == "" {
		props.StorageClass = string(types.StorageClassStandard)
	}
	for k, v := range head.Metadata {
		props.Metadata[k] = v
	}

	tagging, err := a.s3Client.GetObjectTagging(context.TODO(), &s3.GetObjectTaggingInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err == nil {
		for _, tag := range tagging.TagSet {
			props.Tags[aws.ToString(tag.Key)] = aws.ToString(tag.Value)
		}
	}
	return props, nil
}

// UpdateObjectProperties replaces the content type and user metadata of an
// object by copying it onto itself. The other headers, the storage class and
// the tags are carried over.
func (a *App) UpdateObjectProperties(bucket, key, contentType string, metadata map[string]string) error {
	if a.s3Client == nil {
		return fmt.Errorf("not connected to S3")
	}

	clean := make(map[string]string, len(metadata))
	for k, v := range metadata {
		name := strings.ToLower(strings.TrimSpace(k))
		if name == "" {
			return fmt.Errorf("metadata keys must not be empty")
		}
		if strings.ContainsAny(name, " \t:") {
			return fmt.Errorf("invalid metadata key %q", name)
		}
		clean[name] = strings.TrimSpace(v)
	}
	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	head, err := a.s3Client.HeadObject(context.TODO(), &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return err
	}
	if aws.ToInt64(head.ContentLength) > maxCopyInPlaceSize {
		return fmt.Errorf("objects larger than 5 GiB cannot be edited in place")
	}

	_, err = a.s3Client.CopyObject(context.TODO(), &s3.CopyObjectInput{
		Bucket:             aws.String(bucket),
		Key:                aws.String(key),
		CopySource:         aws.String(copySourcePath(bucket, key)),
		MetadataDirective:  types.MetadataDirectiveReplace,
		TaggingDirective:   types.TaggingDirectiveCopy,
		ContentType:        aws.String(contentType),
		Metadata:           clean,
		CacheControl:       head.CacheControl,
		ContentDisposition: head.ContentDisposition,
		ContentEncoding:    head.ContentEncoding,
		ContentLanguage:    head.ContentLanguage,
		StorageClass:       head.StorageClass,
	})
	return err
}
