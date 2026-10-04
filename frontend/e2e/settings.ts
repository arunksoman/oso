import type { Page } from '@playwright/test';

/**
 * Open the settings window. The desktop app opens a second native window; the
 * server-mode build has none and opens the same page in a browser window.
 */
export async function openSettings(
	page: Page,
	open: () => Promise<void> = () => page.getByTitle('Settings').click()
): Promise<Page> {
	const [settings] = await Promise.all([page.waitForEvent('popup'), open()]);
	await settings.waitForLoadState();
	return settings;
}
