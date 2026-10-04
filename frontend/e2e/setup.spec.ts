import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bucket, s3, setupHome } from './env';
import { openSettings } from './settings';

// First launch: no saved profiles and no S3_* variables. These tests share one
// backend and run in order, from the setup screen through several connection
// profiles and back to the setup screen.
test.describe.configure({ mode: 'serial' });

const firstProfile = new URL(s3.endpoint).host;
const toast = (page: Page, text: string | RegExp) => page.getByText(text).last();

function savedProfiles(): { activeId: string; profiles: Record<string, string>[] } {
	return JSON.parse(readFileSync(join(setupHome, '.oso', 'profiles.json'), 'utf8'));
}

async function fillSetup(page: Page, secretKey: string) {
	await page.getByLabel('Endpoint URL').fill(s3.endpoint);
	await page.getByLabel('Access Key').fill(s3.accessKey);
	await page.getByLabel('Secret Key').fill(secretKey);
}

/** Add a connection in the settings window */
async function addProfile(settings: Page, name: string, secretKey: string) {
	await settings.getByRole('button', { name: 'New connection' }).click();
	await settings.getByLabel('Name').fill(name);
	await settings.getByLabel('Endpoint URL').fill(s3.endpoint);
	await settings.getByLabel('Access Key').fill(s3.accessKey);
	await settings.getByLabel('Secret Key').fill(secretKey);
}

async function switchTo(page: Page, name: string) {
	await page.getByTitle('Switch connection').click();
	await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
}

test('shows the setup screen and validates required fields', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('Object Storage Operator')).toBeVisible();
	await expect(page.getByText('Saved connections')).toHaveCount(0);

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

test('connects, saves the first profile and stays connected after a reload', async ({ page }) => {
	await page.goto('/');
	await fillSetup(page, s3.secretKey);

	await page.getByRole('button', { name: 'Connect' }).click();

	await expect(page.getByRole('button', { name: bucket, exact: true })).toBeVisible();
	await expect(page.getByTitle('Switch connection')).toContainText(firstProfile);
	const saved = savedProfiles();
	expect(saved.profiles).toHaveLength(1);
	expect(saved.profiles[0]).toMatchObject({
		name: firstProfile,
		endpoint: s3.endpoint,
		accessKey: s3.accessKey,
		secretKey: s3.secretKey,
		region: 'us-east-1'
	});
	expect(saved.activeId).toBe(saved.profiles[0].id);

	await page.reload();
	await expect(page.getByRole('button', { name: bucket, exact: true })).toBeVisible();
});

test('adds a second profile and switches to it from the sidebar', async ({ page }) => {
	await page.goto('/');
	const settings = await openSettings(page);
	await settings.getByRole('button', { name: 'Connections' }).click();
	await expect(settings.getByRole('listitem', { name: firstProfile })).toContainText('Active');

	await addProfile(settings, 'Second account', s3.secretKey);
	await settings.getByRole('button', { name: 'Test connection' }).click();
	await expect(settings.getByText('Connection works')).toBeVisible();
	await settings.getByRole('button', { name: 'Save' }).click();
	await expect(toast(settings, 'Connection "Second account" saved')).toBeVisible();

	// Saving does not switch: the explorer learns about the profile and offers it
	await expect(page.getByTitle('Switch connection')).toContainText(firstProfile);
	await page.getByRole('button', { name: bucket, exact: true }).click();
	await switchTo(page, 'Second account');

	await expect(toast(page, 'Connected to "Second account"')).toBeVisible();
	await expect(page.getByTitle('Switch connection')).toContainText('Second account');
	// A new connection starts at its bucket list
	await expect(page.getByText('Select a bucket from the sidebar')).toBeVisible();
	await expect(page.getByRole('button', { name: bucket, exact: true })).toBeVisible();
	await expect(settings.getByRole('listitem', { name: 'Second account' })).toContainText('Active');

	const saved = savedProfiles();
	expect(saved.profiles.map((p) => p.name)).toEqual([firstProfile, 'Second account']);
	expect(saved.activeId).toBe(saved.profiles[1].id);
});

test('keeps the working connection when a profile cannot connect', async ({ page }) => {
	await page.goto('/');
	const settings = await openSettings(page);
	await settings.getByRole('button', { name: 'Connections' }).click();
	await addProfile(settings, 'Broken', 'wrong-secret');
	await settings.getByRole('button', { name: 'Test connection' }).click();
	await expect(settings.getByText(/connection failed/)).toBeVisible();
	await settings.getByRole('button', { name: 'Save' }).click();
	await expect(toast(settings, 'Connection "Broken" saved')).toBeVisible();

	await switchTo(page, 'Broken');

	await expect(toast(page, /connection failed/)).toBeVisible();
	await expect(page.getByTitle('Switch connection')).toContainText('Second account');
	await expect(page.getByRole('button', { name: bucket, exact: true })).toBeVisible();

	// Deleting needs a second click
	const broken = settings.getByRole('listitem', { name: 'Broken' });
	await broken.getByTitle('Delete Broken').click();
	await broken.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(broken).toHaveCount(0);
	expect(savedProfiles().profiles.map((p) => p.name)).toEqual([firstProfile, 'Second account']);
});

test('disconnects from the settings window and reconnects with a saved profile', async ({
	page
}) => {
	await page.goto('/');
	const settings = await openSettings(page);
	await settings.getByRole('button', { name: 'Connections' }).click();

	await settings
		.getByRole('listitem', { name: 'Second account' })
		.getByRole('button', { name: 'Disconnect' })
		.click();

	// The explorer follows and offers the saved profiles on the setup screen
	await expect(page.getByText('Object Storage Operator')).toBeVisible();
	await expect(page.getByText('Saved connections')).toBeVisible();
	expect(savedProfiles().activeId).toBe('');

	// Disconnected is remembered across a restart of the page
	await page.reload();
	await expect(page.getByText('Saved connections')).toBeVisible();

	await page.getByRole('button', { name: new RegExp(`^${firstProfile}`) }).click();

	await expect(page.getByRole('button', { name: bucket, exact: true })).toBeVisible();
	await expect(page.getByTitle('Switch connection')).toContainText(firstProfile);
});
