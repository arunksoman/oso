import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { Window } from '@wailsio/runtime';
import {
  CheckForUpdates,
  GetAvailableUpdate,
  GetSettings,
  GetVersion,
  IsConnected,
  ListProfiles,
  OpenDirectoryDialog,
  SaveSettings,
} from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import { deferred, emitEvent, profile } from '../../../test/helpers';
import SettingsWindow from './SettingsWindow.svelte';
import GeneralSection from './GeneralSection.svelte';
import AboutSection from './AboutSection.svelte';

async function openWindow(search = '') {
  window.history.replaceState({}, '', `/settings${search}`);
  const view = render(SettingsWindow);
  await vi.waitFor(() => expect(view.container.querySelector('.loading-md')).toBeNull());
  return view;
}

const nav = (name: string) => screen.getByRole('button', { name });

describe('SettingsWindow', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('opens on the general section with every section in the sidebar', async () => {
    vi.mocked(GetVersion).mockResolvedValue('0.7.2');
    await openWindow();

    expect(screen.getByRole('heading', { name: 'General' })).toBeTruthy();
    expect(nav('General').getAttribute('aria-current')).toBe('page');
    expect(nav('Connections').getAttribute('aria-current')).toBeNull();
    expect(nav('About')).toBeTruthy();
    expect(screen.getByText('Downloads')).toBeTruthy();
    expect(await screen.findByText('Oso v0.7.2')).toBeTruthy();
  });

  it('shows a spinner until the shared state is loaded', async () => {
    const pending = deferred<boolean>();
    vi.mocked(IsConnected).mockReturnValue(pending.promise as never);
    window.history.replaceState({}, '', '/settings');
    const { container } = render(SettingsWindow);

    expect(container.querySelector('.loading-md')).toBeTruthy();
    expect(screen.queryByText('Downloads')).toBeNull();

    pending.resolve(true);
    expect(await screen.findByText('Downloads')).toBeTruthy();
  });

  it('still opens when the backend cannot be reached', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(GetSettings).mockRejectedValue('runtime unavailable');
    vi.mocked(GetVersion).mockRejectedValue('runtime unavailable');

    await openWindow();

    expect(screen.getByText('Downloads')).toBeTruthy();
    expect(error).toHaveBeenCalledWith('Startup error:', 'runtime unavailable');
    expect(screen.queryByText(/Oso v/)).toBeNull();
  });

  it('switches sections from the sidebar', async () => {
    vi.mocked(ListProfiles).mockResolvedValue([profile('work', { name: 'Work' })]);
    await openWindow();

    await fireEvent.click(nav('Connections'));
    expect(screen.getByRole('heading', { name: 'Connections' })).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();

    await fireEvent.click(nav('About'));
    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy();
    expect(screen.getByText('Updates')).toBeTruthy();

    await fireEvent.click(nav('General'));
    expect(screen.getByText('Downloads')).toBeTruthy();
  });

  it('opens the section named in the URL', async () => {
    await openWindow('?section=connections');
    expect(screen.getByRole('heading', { name: 'Connections' })).toBeTruthy();
  });

  it('falls back to general for an unknown section', async () => {
    await openWindow('?section=nonsense');
    expect(screen.getByRole('heading', { name: 'General' })).toBeTruthy();
  });

  it('shows the section the explorer asks for', async () => {
    await openWindow();

    emitEvent('settings:navigate', 'about');

    expect(await screen.findByRole('heading', { name: 'About' })).toBeTruthy();
  });

  it('follows settings saved by the explorer', async () => {
    await openWindow();

    emitEvent('settings:changed', { theme: 'light', pageSize: 250 });

    await vi.waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true'),
    );
  });

  it('is frameless: a drag region with its own close button', async () => {
    const { container } = await openWindow();

    expect(container.querySelector('[style*="--wails-draggable: drag"]')).toBeTruthy();
    expect(screen.getByTitle('Close').closest('[style*="no-drag"]')).toBeTruthy();

    await fireEvent.click(screen.getByTitle('Close'));
    expect(Window.Close).toHaveBeenCalledOnce();
  });

  it('closes the browser window it was opened in when there is no native window', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    Object.defineProperty(window, 'opener', { value: {}, configurable: true });
    await openWindow();

    await fireEvent.click(screen.getByTitle('Close'));

    expect(close).toHaveBeenCalledOnce();
    Object.defineProperty(window, 'opener', { value: null, configurable: true });
  });

  it('stops listening when the window goes away', async () => {
    const { unmount } = await openWindow();
    const { Events } = await import('@wailsio/runtime');
    const removers = vi.mocked(Events.On).mock.results.map((result) => result.value);

    unmount();

    expect(removers.length).toBe(3);
    for (const remove of removers) expect(remove).toHaveBeenCalledOnce();
  });
});

describe('GeneralSection', () => {
  const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });

  it('starts from the current settings with nothing to save', () => {
    appState.settings = {
      defaultDownloadPath: '/downloads',
      askBeforeDownload: false,
      showFileDetails: true,
      theme: 'light',
      pageSize: 250,
    };
    render(GeneralSection);

    expect(screen.getByPlaceholderText<HTMLInputElement>('Default download folder').value).toBe('/downloads');
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText<HTMLSelectElement>('Items per page').value).toBe('250');
    expect(screen.getByText('All changes saved')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('saves every changed setting', async () => {
    render(GeneralSection);

    await fireEvent.input(screen.getByPlaceholderText('Default download folder'), { target: { value: '/data' } });
    await fireEvent.click(screen.getByLabelText('Ask for save location before each download'));
    await fireEvent.click(screen.getByLabelText('Show file details (size, type, modified)'));
    await fireEvent.change(screen.getByLabelText('Items per page'), { target: { value: '100' } });
    await fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByText('Unsaved changes')).toBeTruthy();

    await fireEvent.click(saveButton());
    await vi.waitFor(() => expect(appState.notification).not.toBeNull());

    const saved = {
      defaultDownloadPath: '/data',
      askBeforeDownload: false,
      showFileDetails: false,
      theme: 'light',
      pageSize: 100,
    };
    expect(SaveSettings).toHaveBeenCalledWith(saved);
    expect(appState.settings).toEqual(saved);
    expect(appState.notification).toEqual({ message: 'Settings saved', type: 'success' });
    await vi.waitFor(() => expect(saveButton().disabled).toBe(true));
  });

  it('resets unsaved changes', async () => {
    render(GeneralSection);
    await fireEvent.click(screen.getByRole('radio', { name: 'Light' }));

    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByRole('radio', { name: 'Night' }).getAttribute('aria-checked')).toBe('true');
    expect(SaveSettings).not.toHaveBeenCalled();
  });

  it('reports a failed save and keeps the changes', async () => {
    vi.mocked(SaveSettings).mockRejectedValue('disk full');
    render(GeneralSection);
    await fireEvent.click(screen.getByRole('radio', { name: 'Light' }));

    await fireEvent.click(saveButton());

    await vi.waitFor(() =>
      expect(appState.notification).toEqual({ message: 'Save failed: disk full', type: 'error' }),
    );
    expect(appState.settings.theme).toBe('night');
    expect(saveButton().disabled).toBe(false);
  });

  it('disables save while saving', async () => {
    const pending = deferred<void>();
    vi.mocked(SaveSettings).mockReturnValue(pending.promise as never);
    render(GeneralSection);
    await fireEvent.click(screen.getByRole('radio', { name: 'Light' }));

    await fireEvent.click(saveButton());

    await vi.waitFor(() => expect(saveButton().disabled).toBe(true));
    expect(saveButton().querySelector('.loading')).toBeTruthy();
    pending.resolve();
    await vi.waitFor(() => expect(appState.notification).not.toBeNull());
  });

  it('picks the download folder with the folder dialog', async () => {
    vi.mocked(OpenDirectoryDialog).mockResolvedValue('/picked');
    render(GeneralSection);

    await fireEvent.click(screen.getByRole('button', { name: 'Browse' }));

    await vi.waitFor(() =>
      expect(screen.getByPlaceholderText<HTMLInputElement>('Default download folder').value).toBe('/picked'),
    );
  });

  it('keeps the folder when the dialog is cancelled', async () => {
    appState.settings.defaultDownloadPath = '/before';
    vi.mocked(OpenDirectoryDialog).mockResolvedValue('');
    render(GeneralSection);

    await fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await vi.waitFor(() => expect(OpenDirectoryDialog).toHaveBeenCalled());

    expect(screen.getByPlaceholderText<HTMLInputElement>('Default download folder').value).toBe('/before');
  });

  it('reports when the folder dialog is not available', async () => {
    vi.mocked(OpenDirectoryDialog).mockRejectedValue('no dialogs in server mode');
    render(GeneralSection);

    await fireEvent.click(screen.getByRole('button', { name: 'Browse' }));

    await vi.waitFor(() =>
      expect(appState.notification).toEqual({
        message: 'Could not open the folder picker: no dialogs in server mode',
        type: 'error',
      }),
    );
  });
});

describe('AboutSection', () => {
  it('shows the current version', async () => {
    vi.mocked(GetVersion).mockResolvedValue('0.7.2');
    render(AboutSection);

    expect(await screen.findByText('Current version v0.7.2')).toBeTruthy();
    expect(screen.getByText('~/.oso/profiles.json')).toBeTruthy();
  });

  it('shows a dash when the version is unknown', async () => {
    vi.mocked(GetVersion).mockRejectedValue('no runtime');
    render(AboutSection);

    await vi.waitFor(() => expect(GetVersion).toHaveBeenCalled());
    expect(screen.getByText('Current version —')).toBeTruthy();
  });

  it('reports that the app is up to date', async () => {
    vi.mocked(GetAvailableUpdate).mockResolvedValue('');
    render(AboutSection);

    await fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(await screen.findByText("You're up to date")).toBeTruthy();
  });

  it('offers an available update and opens the update window', async () => {
    vi.mocked(GetAvailableUpdate).mockResolvedValue('0.8.0');
    render(AboutSection);

    await fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText('Version v0.8.0 is available')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Update to v0.8.0' }));
    expect(CheckForUpdates).toHaveBeenCalledOnce();
  });

  it('shows a spinner while checking and reports a failure', async () => {
    const pending = deferred<string>();
    vi.mocked(GetAvailableUpdate).mockReturnValue(pending.promise as never);
    render(AboutSection);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Check for updates' });

    await fireEvent.click(button);
    await vi.waitFor(() => expect(button.disabled).toBe(true));
    expect(button.querySelector('.loading')).toBeTruthy();

    pending.reject('update check failed: rate limited');
    expect(await screen.findByText('update check failed: rate limited')).toBeTruthy();
    expect(button.disabled).toBe(false);
  });
});
