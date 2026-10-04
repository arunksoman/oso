import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { appHome, bucket, createdBucket, deletedBucket, downloadDir } from './env';
import {
	bucketExists,
	createBucket,
	headObject,
	listKeys,
	putObject,
	readObject,
	seed
} from './s3';
import { openSettings } from './settings';

const row = (page: Page, name: string) => page.locator('tbody tr').filter({ hasText: name });
const toast = (page: Page, text: string | RegExp) => page.getByText(text).last();
const select = (page: Page, name: string) => row(page, name).getByRole('checkbox').check();

/** Open the app and go to a folder of the test bucket */
async function openFolder(page: Page, ...folders: string[]) {
	await page.goto('/');
	await page.getByRole('button', { name: bucket, exact: true }).click();
	for (const folder of folders) {
		await row(page, folder).dblclick();
		await expect(page.getByRole('button', { name: folder, exact: true })).toBeVisible();
	}
}

test.describe('browsing', () => {
	test.beforeAll(async () => {
		await seed({
			'browse/a.txt': 'aaa',
			'browse/docs/readme.md': '# readme',
			'browse/docs/deep/notes.txt': 'notes'
		});
	});

	test('connects from the environment and lists buckets', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('button', { name: bucket, exact: true })).toBeVisible();
		await expect(page.getByText('Select a bucket from the sidebar')).toBeVisible();
		await expect(page.getByTitle('Check for updates')).toHaveText(/^v\d+\.\d+\.\d+/);
	});

	test('navigates into folders and back through the breadcrumb', async ({ page }) => {
		await openFolder(page, 'browse');

		await expect(row(page, 'a.txt')).toContainText('3 B');
		await expect(row(page, 'a.txt')).toContainText('TXT');
		await expect(row(page, 'docs')).toContainText('Folder');
		await expect(page.getByText('2 items')).toBeVisible();

		await row(page, 'docs').dblclick();
		await expect(row(page, 'readme.md')).toBeVisible();
		await expect(row(page, 'deep')).toBeVisible();

		await page.getByRole('button', { name: 'browse', exact: true }).click();
		await expect(row(page, 'a.txt')).toBeVisible();

		await page.getByTitle('Go to parent folder').click();
		await expect(row(page, 'browse')).toBeVisible();
	});

	test('searches the current folder on the server', async ({ page }) => {
		await openFolder(page, 'browse', 'docs');

		await page.getByPlaceholder('Filter...').fill('READ');

		await expect(page.getByText('1 match(es)')).toBeVisible();
		await expect(row(page, 'readme.md')).toBeVisible();
		await expect(row(page, 'deep')).toHaveCount(0);
	});
});

test.describe('changing objects', () => {
	test('creates a folder', async ({ page }) => {
		await seed({ 'mkdir/keep.txt': 'x' });
		await openFolder(page, 'mkdir');

		await page.getByTitle('New folder').click();
		await page.getByPlaceholder('folder-name').fill('reports');
		await page.getByPlaceholder('folder-name').press('Enter');

		await expect(toast(page, 'Folder created')).toBeVisible();
		await expect(row(page, 'reports')).toContainText('Folder');
		expect(await listKeys('mkdir/')).toEqual(['mkdir/keep.txt', 'mkdir/reports/']);
	});

	test('copies a file into another folder', async ({ page }) => {
		await seed({ 'copy/a.txt': 'copy me', 'copy/dest/keep.txt': 'x' });
		await openFolder(page, 'copy');

		await select(page, 'a.txt');
		await page.getByTitle('Copy', { exact: true }).click();
		await page.getByRole('button', { name: 'Clear', exact: true }).click();
		await row(page, 'dest').dblclick();
		await page.getByRole('button', { name: 'Paste here' }).click();

		await expect(toast(page, 'Pasted 1 item(s)')).toBeVisible();
		await expect(row(page, 'a.txt')).toBeVisible();
		expect(await listKeys('copy/')).toEqual(['copy/a.txt', 'copy/dest/a.txt', 'copy/dest/keep.txt']);
		expect(await readObject('copy/dest/a.txt')).toBe('copy me');
	});

	test('moves a folder with cut and paste', async ({ page }) => {
		await seed({
			'move/src/one.txt': '1',
			'move/src/nested/two.txt': '2',
			'move/dest/keep.txt': 'x'
		});
		await openFolder(page, 'move');

		await select(page, 'src');
		await page.getByTitle('Cut', { exact: true }).click();
		await page.getByRole('button', { name: 'Clear', exact: true }).click();
		await row(page, 'dest').dblclick();
		await page.getByRole('button', { name: 'Paste here' }).click();

		await expect(toast(page, 'Pasted 1 item(s)')).toBeVisible();
		await expect(row(page, 'src')).toBeVisible();
		expect(await listKeys('move/')).toEqual([
			'move/dest/keep.txt',
			'move/dest/src/nested/two.txt',
			'move/dest/src/one.txt'
		]);
	});

	test('deletes files and folders after confirmation', async ({ page }) => {
		await seed({
			'delete/a.txt': 'a',
			'delete/sub/x.txt': 'x',
			'delete/sub/deep/y.txt': 'y',
			'delete/keep.txt': 'keep'
		});
		await openFolder(page, 'delete');

		await select(page, 'a.txt');
		await select(page, 'sub');
		await page.getByTitle('Delete selected').click();

		await expect(page.getByText('Folders will be deleted recursively.')).toBeVisible();
		await page.getByRole('button', { name: 'Delete', exact: true }).last().click();

		await expect(toast(page, 'Deleted 2 item(s)')).toBeVisible();
		await expect(row(page, 'a.txt')).toHaveCount(0);
		await expect(row(page, 'keep.txt')).toBeVisible();
		expect(await listKeys('delete/')).toEqual(['delete/keep.txt']);
	});

	test('cancelling the confirmation deletes nothing', async ({ page }) => {
		await seed({ 'cancel/a.txt': 'a' });
		await openFolder(page, 'cancel');

		await select(page, 'a.txt');
		await page.keyboard.press('Delete');
		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect(row(page, 'a.txt')).toBeVisible();
		expect(await listKeys('cancel/')).toEqual(['cancel/a.txt']);
	});
});

test.describe('sharing and downloading', () => {
	test('generates a presigned URL that serves the object', async ({ page, request }) => {
		await seed({ 'share/hello.txt': 'hello from e2e' });
		await openFolder(page, 'share');

		await row(page, 'hello.txt').click({ button: 'right' });
		await page.getByRole('menu').getByText('Copy presigned URL').click();

		const url = await page.locator('p.break-all').innerText();
		expect(url).toContain(`/${bucket}/share/hello.txt`);
		expect(url).toContain('X-Amz-Expires=3600');
		const response = await request.get(url);
		expect(response.status()).toBe(200);
		expect(await response.text()).toBe('hello from e2e');
	});

	test('saves settings in the settings window and downloads into the default folder', async ({
		page
	}) => {
		await seed({ 'download/report.txt': 'quarterly numbers' });
		await openFolder(page, 'download');

		const settings = await openSettings(page);
		await settings.getByPlaceholder('Default download folder').fill(downloadDir);
		await settings.getByLabel('Ask for save location before each download').uncheck();
		await settings.getByRole('button', { name: 'Save' }).click();
		await expect(toast(settings, 'Settings saved')).toBeVisible();
		await expect(settings.getByText('All changes saved')).toBeVisible();

		// The explorer takes the saved settings over without a reload
		await select(page, 'report.txt');
		await page.getByTitle('Download', { exact: true }).click();

		await expect(toast(page, 'Downloaded "report.txt"')).toBeVisible();
		expect(readFileSync(join(downloadDir, 'report.txt'), 'utf8')).toBe('quarterly numbers');

		// Settings are written to ~/.oso/settings.json and survive a reload
		const saved = JSON.parse(readFileSync(join(appHome, '.oso', 'settings.json'), 'utf8'));
		expect(saved).toMatchObject({ defaultDownloadPath: downloadDir, askBeforeDownload: false });
		await settings.reload();
		await expect(settings.getByPlaceholder('Default download folder')).toHaveValue(downloadDir);
		await expect(
			settings.getByLabel('Ask for save location before each download')
		).not.toBeChecked();
	});
});

test.describe('settings window', () => {
	test('lists its sections in a sidebar', async ({ page }) => {
		await page.goto('/');
		const settings = await openSettings(page);
		const sections = settings.getByRole('navigation', { name: 'Settings sections' });

		await expect(settings.getByRole('heading', { name: 'General' })).toBeVisible();
		await expect(sections.getByRole('button', { name: 'General' })).toHaveAttribute(
			'aria-current',
			'page'
		);

		await sections.getByRole('button', { name: 'Connections' }).click();
		await expect(settings.getByRole('heading', { name: 'Connections' })).toBeVisible();
		await expect(settings.getByRole('listitem', { name: 'Environment' })).toContainText('Active');

		await sections.getByRole('button', { name: 'About' }).click();
		await expect(settings.getByText(/Current version v\d+\.\d+\.\d+/)).toBeVisible();
	});

	test('opens on the connections section from the sidebar', async ({ page }) => {
		await page.goto('/');

		const settings = await openSettings(page, async () => {
			await page.getByTitle('Switch connection').click();
			await page.getByRole('button', { name: 'Manage connections' }).click();
		});

		await expect(settings.getByRole('heading', { name: 'Connections' })).toBeVisible();
	});

	test('changes the theme of both windows', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
		const settings = await openSettings(page);

		await settings.getByRole('radio', { name: 'Light' }).click();
		await settings.getByRole('button', { name: 'Save' }).click();

		await expect(settings.locator('html')).toHaveAttribute('data-theme', 'light');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

		// The toggle in the explorer title bar reaches the settings window too
		await page.locator('label.swap').click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
		await expect(settings.locator('html')).toHaveAttribute('data-theme', 'night');
		await expect(settings.getByRole('radio', { name: 'Night' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	});
});

test.describe('object properties', () => {
	test('shows the properties and edits content type and metadata in place', async ({ page }) => {
		await seed({ 'props/data.bin': 'payload' });
		await openFolder(page, 'props');

		await row(page, 'data.bin').click({ button: 'right' });
		await page.getByRole('menu').getByText('Properties').click();

		const panel = page.getByLabel('Object properties');
		await expect(panel.getByText(`s3://${bucket}/props/data.bin`)).toBeVisible();
		await expect(panel.getByText('7 B')).toBeVisible();
		await expect(panel.getByRole('button', { name: 'Save' })).toBeDisabled();

		await panel.getByLabel('Content-Type').fill('text/plain');
		await panel.getByRole('button', { name: 'Add' }).click();
		await panel.getByLabel('Metadata key 1').fill('Owner');
		await panel.getByLabel('Metadata value 1').fill('e2e');
		await panel.getByRole('button', { name: 'Save' }).click();

		await expect(toast(page, 'Updated "data.bin"')).toBeVisible();
		await expect(panel.getByLabel('Metadata key 1')).toHaveValue('owner');
		expect(await headObject('props/data.bin')).toEqual({
			contentType: 'text/plain',
			metadata: { owner: 'e2e' }
		});
		expect(await readObject('props/data.bin')).toBe('payload');

		await panel.getByTitle('Close properties').click();
		await expect(panel).toHaveCount(0);
	});
});

test.describe('drag and drop', () => {
	test('moves a file by dragging its row onto a folder', async ({ page }) => {
		await seed({ 'drag/a.txt': 'drag me', 'drag/dest/keep.txt': 'x' });
		await openFolder(page, 'drag');

		await row(page, 'a.txt').dragTo(row(page, 'dest'));

		await expect(toast(page, 'Moved 1 item(s) to "dest"')).toBeVisible();
		await expect(row(page, 'a.txt')).toHaveCount(0);
		expect(await listKeys('drag/')).toEqual(['drag/dest/a.txt', 'drag/dest/keep.txt']);
		expect(await readObject('drag/dest/a.txt')).toBe('drag me');
	});

	test('moves the whole selection, folders included', async ({ page }) => {
		await seed({
			'dragmany/one.txt': '1',
			'dragmany/sub/two.txt': '2',
			'dragmany/dest/keep.txt': 'x'
		});
		await openFolder(page, 'dragmany');
		await select(page, 'one.txt');
		await select(page, 'sub');

		await row(page, 'one.txt').dragTo(row(page, 'dest'));

		await expect(toast(page, 'Moved 2 item(s) to "dest"')).toBeVisible();
		expect(await listKeys('dragmany/')).toEqual([
			'dragmany/dest/keep.txt',
			'dragmany/dest/one.txt',
			'dragmany/dest/sub/two.txt'
		]);
	});

	test('marks the list and its folders as targets for files from the OS', async ({ page }) => {
		await seed({ 'droptarget/dest/keep.txt': 'x' });
		await openFolder(page, 'droptarget');

		// Server mode has no native window to drop files on; the unit tests cover the upload
		await expect(page.locator('[role="region"][data-file-drop-target]')).toBeVisible();
		await expect(row(page, 'dest')).toHaveAttribute('data-drop-prefix', 'droptarget/dest/');
	});
});

test.describe('buckets', () => {
	test('rejects an invalid bucket name before calling the server', async ({ page }) => {
		await page.goto('/');

		await page.getByTitle('Create new bucket').click();
		await page.getByPlaceholder('new-bucket-name').fill('Not_Valid');
		await page.getByRole('button', { name: 'Create', exact: true }).click();

		await expect(page.getByText(/Only lowercase letters, numbers, hyphens, dots/)).toBeVisible();
	});

	test('creates a bucket', async ({ page }) => {
		await page.goto('/');

		await page.getByTitle('Create new bucket').click();
		await page.getByPlaceholder('new-bucket-name').fill(createdBucket);
		await page.getByPlaceholder('new-bucket-name').press('Enter');

		await expect(toast(page, `Bucket "${createdBucket}" created`)).toBeVisible();
		await page.getByRole('button', { name: createdBucket, exact: true }).click();
		await expect(page.getByText('This folder is empty')).toBeVisible();
		expect(await listKeys('', createdBucket)).toEqual([]);
	});

	test('deletes a bucket only after its name is typed', async ({ page }) => {
		await createBucket(deletedBucket);
		await putObject(deletedBucket, 'leftover/file.txt', 'still here');
		await page.goto('/');
		await page.getByRole('button', { name: deletedBucket, exact: true }).click();
		await expect(row(page, 'leftover')).toBeVisible();

		await page.getByTitle(`Delete bucket ${deletedBucket}`).click();
		const confirm = page.getByRole('button', { name: 'Delete bucket', exact: true });
		await expect(confirm).toBeDisabled();
		await page.getByLabel(/to confirm/).fill('oso-e2e');
		await expect(confirm).toBeDisabled();

		// S3 refuses to delete a bucket that still has objects
		await page.getByLabel(/to confirm/).fill(deletedBucket);
		await confirm.click();
		await expect(page.getByText(/failed to delete bucket/)).toBeVisible();
		expect(await bucketExists(deletedBucket)).toBe(true);

		await page.getByLabel(/Delete all objects in the bucket first/).check();
		await confirm.click();

		await expect(toast(page, `Bucket "${deletedBucket}" deleted`)).toBeVisible();
		await expect(page.getByRole('button', { name: deletedBucket, exact: true })).toHaveCount(0);
		await expect(page.getByText('Select a bucket from the sidebar')).toBeVisible();
		expect(await bucketExists(deletedBucket)).toBe(false);
		expect(await bucketExists(bucket)).toBe(true);
	});
});

test.describe('updates', () => {
	test('checks for updates from the settings window', async ({ page }) => {
		await page.goto('/');
		const settings = await openSettings(page);
		await settings.getByRole('button', { name: 'About' }).click();
		await expect(settings.getByText(/Current version v\d+\.\d+\.\d+/)).toBeVisible();

		await settings.getByRole('button', { name: 'Check for updates' }).click();

		// The answer depends on the latest GitHub release and on network access;
		// what matters here is that the check completes and reports one of them.
		await expect(
			settings
				.getByText("You're up to date")
				.or(settings.getByText(/Version v.+ is available/))
				.or(settings.getByText(/update check failed/))
		).toBeVisible({ timeout: 45_000 });
	});
});
