import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bucket, s3, setupHome } from './env';

// First launch: no saved config and no S3_* variables. These tests share one
// backend and run in order, from the setup screen to connected and back.
test.describe.configure({ mode: 'serial' });

async function fillSetup(page: Page, secretKey: string) {
	await page.getByLabel('Endpoint URL').fill(s3.endpoint);
	await page.getByLabel('Access Key').fill(s3.accessKey);
	await page.getByLabel('Secret Key').fill(secretKey);
}

test('shows the setup screen and validates required fields', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('Object Storage Operator')).toBeVisible();

	await page.getByRole('button', { name: 'Connect' }).click();

	await expect(page.getByText('Endpoint, Access Key and Secret Key are required')).toBeVisible();
});

test('rejects wrong credentials', async ({ page }) => {
	await page.goto('/');
	await fillSetup(page, 'wrong-secret');

	await page.getByRole('button', { name: 'Connect' }).click();

	await expect(page.getByText(/connection failed/)).toBeVisible();
	await expect(page.getByText('Object Storage Operator')).toBeVisible();
});

test('connects, saves the config and stays connected after a reload', async ({ page }) => {
	await page.goto('/');
	await fillSetup(page, s3.secretKey);

	await page.getByRole('button', { name: 'Connect' }).click();

	await expect(page.getByRole('button', { name: bucket, exact: true })).toBeVisible();
	const saved = JSON.parse(readFileSync(join(setupHome, '.oso', 'config.json'), 'utf8'));
	expect(saved).toEqual({
		endpoint: s3.endpoint,
		accessKey: s3.accessKey,
		secretKey: s3.secretKey,
		region: 'us-east-1'
	});

	await page.reload();
	await expect(page.getByRole('button', { name: bucket, exact: true })).toBeVisible();
});

test('shows the saved connection and disconnects', async ({ page }) => {
	await page.goto('/');
	await page.getByTitle('Settings').click();
	await page.getByRole('button', { name: 'Connection' }).click();

	await expect(page.getByLabel('Endpoint URL')).toHaveValue(s3.endpoint);
	await expect(page.getByLabel('Access Key')).toHaveValue(s3.accessKey);

	await page.getByRole('button', { name: 'Disconnect' }).click();

	await expect(page.getByText('Object Storage Operator')).toBeVisible();
});
