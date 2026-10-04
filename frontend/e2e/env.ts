import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Server-mode build of the app; override with OSO_SERVER_BINARY */
export const serverBinary =
	process.env.OSO_SERVER_BINARY ??
	resolve(
		import.meta.dirname,
		'../../bin',
		process.platform === 'win32' ? 'oso-server.exe' : 'oso-server'
	);

export const appURL = 'http://127.0.0.1:34115';
export const setupURL = 'http://127.0.0.1:34116';

/** Home directories of the two backends; ~/.oso lives inside them */
export const appHome = join(tmpdir(), 'oso-e2e-app-home');
export const setupHome = join(tmpdir(), 'oso-e2e-setup-home');
export const downloadDir = join(appHome, 'downloads');

/** RustFS from docker-compose.yaml unless overridden */
export const s3 = {
	endpoint: process.env.E2E_S3_ENDPOINT ?? 'http://localhost:9000',
	accessKey: process.env.E2E_S3_ACCESS_KEY ?? 'osodev',
	secretKey: process.env.E2E_S3_SECRET_KEY ?? 'osodevpass',
	region: 'us-east-1'
};

/** Buckets owned by the tests; both are removed again in global teardown */
export const bucket = 'oso-e2e';
export const createdBucket = 'oso-e2e-created';
