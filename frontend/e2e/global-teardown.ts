import { bucket, createdBucket, deletedBucket } from './env';
import { removeBucket } from './s3';

export default async function globalTeardown() {
	await removeBucket(bucket);
	await removeBucket(createdBucket);
	await removeBucket(deletedBucket);
}
