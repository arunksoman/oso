import { existsSync, mkdirSync } from 'node:fs';
import { bucket, createdBucket, downloadDir, serverBinary } from './env';
import { createBucket, removeBucket } from './s3';

export default async function globalSetup() {
	if (!existsSync(serverBinary)) {
		throw new Error(
			`Server build not found at ${serverBinary}. Build it with: wails3 task build:server`
		);
	}
	mkdirSync(downloadDir, { recursive: true });
	try {
		await createBucket(bucket);
		await removeBucket(createdBucket);
	} catch (error) {
		throw new Error('RustFS is not reachable; start it with: docker compose up -d', {
			cause: error
		});
	}
}
