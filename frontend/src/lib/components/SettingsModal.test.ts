import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import {
  CheckForUpdates,
  GetAvailableUpdate,
  GetSavedConfig,
  GetVersion,
  SaveSettings,
} from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import SettingsModal from './SettingsModal.svelte';

vi.mock('$bindings/oso/app', () => ({
  SaveSettings: vi.fn(),
  GetSavedConfig: vi.fn(),
  Connect: vi.fn(),
  Disconnect: vi.fn(),
  OpenDirectoryDialog: vi.fn(),
  GetVersion: vi.fn(),
  GetAvailableUpdate: vi.fn(),
  CheckForUpdates: vi.fn(),
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(GetVersion).mockResolvedValue('0.7.0');
    vi.mocked(GetSavedConfig).mockResolvedValue(null);
    vi.mocked(SaveSettings).mockResolvedValue(undefined);
    appState.showSettings = true;
    appState.notification = null;
  });

  it('shows the current version', async () => {
    render(SettingsModal);
    expect(await screen.findByText('Current version v0.7.0')).toBeTruthy();
  });

  it('does not check for updates until asked', async () => {
    render(SettingsModal);
    await screen.findByText('Current version v0.7.0');
    expect(GetAvailableUpdate).not.toHaveBeenCalled();
  });

  it('reports when the app is up to date', async () => {
    vi.mocked(GetAvailableUpdate).mockResolvedValue('');
    render(SettingsModal);

    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(await screen.findByText("You're up to date")).toBeTruthy();
    expect(CheckForUpdates).not.toHaveBeenCalled();
  });

  it('offers the new version and opens the update window', async () => {
    vi.mocked(GetAvailableUpdate).mockResolvedValue('0.8.0');
    render(SettingsModal);

    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(await screen.findByText('Version v0.8.0 is available')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Update to v0.8.0' }));

    expect(CheckForUpdates).toHaveBeenCalledOnce();
    expect(appState.showSettings).toBe(false);
  });

  it('shows the error and allows a retry when the check fails', async () => {
    vi.mocked(GetAvailableUpdate).mockRejectedValueOnce('update check failed: offline');
    render(SettingsModal);

    const button = screen.getByRole('button', { name: 'Check for updates' });
    await userEvent.click(button);
    expect(await screen.findByText('update check failed: offline')).toBeTruthy();

    vi.mocked(GetAvailableUpdate).mockResolvedValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText("You're up to date")).toBeTruthy();
    expect(screen.queryByText('update check failed: offline')).toBeNull();
  });

  it('saves the edited settings and closes', async () => {
    appState.settings = { ...appState.settings, askBeforeDownload: true };
    render(SettingsModal);

    await userEvent.click(screen.getByLabelText('Ask for save location before each download'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(appState.showSettings).toBe(false));
    expect(SaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ askBeforeDownload: false })
    );
    expect(appState.settings.askBeforeDownload).toBe(false);
    expect(appState.notification).toEqual({ message: 'Settings saved', type: 'success' });
  });
});
