import { rmSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import { appHome, appURL, s3, serverBinary, setupHome, setupURL } from './e2e/env';

// End-to-end tests drive the real Go backend through a browser. The backend is
// the server-mode build of the app (`wails3 task build:server` or
// `go build -tags server`), which serves the same frontend and bindings over
// HTTP instead of a native window. S3 is a real RustFS (`docker compose up -d`).

// The config is loaded again in every worker; only the main process may wipe
// the home directories the servers are about to start with.
if (!process.env.TEST_WORKER_INDEX) {
	rmSync(appHome, { recursive: true, force: true });
	rmSync(setupHome, { recursive: true, force: true });
}

function server(url: string, home: string, env: Record<string, string>) {
	return {
		command: `"${serverBinary}"`,
		url,
		reuseExistingServer: false,
		timeout: 60_000,
		// The backend logs every request; set E2E_SERVER_LOGS=1 to see it
		stderr: process.env.E2E_SERVER_LOGS ? ('pipe' as const) : ('ignore' as const),
		env: {
			// Keeps ~/.oso of the person running the tests untouched
			HOME: home,
			USERPROFILE: home,
			WAILS_SERVER_HOST: new URL(url).hostname,
			WAILS_SERVER_PORT: new URL(url).port,
			...env
		}
	};
}

export default defineConfig({
	testDir: './e2e',
	globalSetup: './e2e/global-setup.ts',
	globalTeardown: './e2e/global-teardown.ts',
	// One backend process holds one connection and one settings file
	workers: 1,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		viewport: { width: 1280, height: 800 }
	},
	projects: [
		{ name: 'app', testMatch: 'app.spec.ts', use: { baseURL: appURL } },
		{ name: 'setup', testMatch: 'setup.spec.ts', use: { baseURL: setupURL } }
	],
	webServer: [
		// Connected from the environment, like a configured install
		server(appURL, appHome, {
			S3_ENDPOINT: s3.endpoint,
			S3_ACCESS_KEY: s3.accessKey,
			S3_SECRET_KEY: s3.secretKey,
			S3_REGION: s3.region
		}),
		// No credentials, like a first launch
		server(setupURL, setupHome, {
			S3_ENDPOINT: '',
			S3_ACCESS_KEY: '',
			S3_SECRET_KEY: ''
		})
	]
});
