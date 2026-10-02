import { bucket, createdBucket } from './env';
import { removeBucket } from './s3';

export default async function globalTeardown() {
	await removeBucket(bucket);
	await removeBucket(createdBucket);
}
