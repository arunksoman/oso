import {
	CreateBucketCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import { bucket, s3 } from './env';

// Direct S3 access for seeding data and for checking what the app really did

const client = new S3Client({
	endpoint: s3.endpoint,
	region: s3.region,
	forcePathStyle: true,
	credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey }
});

export async function createBucket(name: string) {
	await removeBucket(name);
	await client.send(new CreateBucketCommand({ Bucket: name }));
}

export async function removeBucket(name: string) {
	try {
		for (const key of await listKeys('', name)) {
			await client.send(new DeleteObjectCommand({ Bucket: name, Key: key }));
		}
		await client.send(new DeleteBucketCommand({ Bucket: name }));
	} catch (error) {
		if ((error as { name?: string }).name !== 'NoSuchBucket') throw error;
	}
}

/** Create objects in the test bucket: { 'folder/file.txt': 'body' } */
export async function seed(objects: Record<string, string>) {
	for (const [key, body] of Object.entries(objects)) {
		await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
	}
}

export async function listKeys(prefix: string, name = bucket): Promise<string[]> {
	const keys: string[] = [];
	let token: string | undefined;
	do {
		const page = await client.send(
			new ListObjectsV2Command({ Bucket: name, Prefix: prefix, ContinuationToken: token })
		);
		keys.push(...(page.Contents ?? []).map((object) => object.Key!));
		token = page.NextContinuationToken;
	} while (token);
	return keys.sort();
}

export async function readObject(key: string): Promise<string> {
	const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
	return result.Body!.transformToString();
}
