import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import {
  CheckForUpdates,
  Connect,
  Disconnect,
  GetAvailableUpdate,
  GetSavedConfig,
  GetVersion,
  OpenDirectoryDialog,
  SaveSettings,
} from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import { deferred, file } from '../../test/helpers';
import SettingsModal from './SettingsModal.svelte';

const savedConfig = {
  endpoint: 'http://localhost:9000',
  accessKey: 'osodev',
  secretKey: 'osodevpass',
  region: 'eu-west-1',
};

const checkForUpdates = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

async function openConnectionTab() {
  render(SettingsModal);
  await fireEvent.click(screen.getByRole('button', { name: 'Connection' }));
  await vi.waitFor(() =>
    expect(screen.getByLabelText<HTMLInputElement>('Endpoint URL').value).toBe(savedConfig.endpoint)
  );
}

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.mocked(GetVersion).mockResolvedValue('0.7.0');
    vi.mocked(GetSavedConfig).mockResolvedValue(savedConfig);
    appState.showSettings = true;
  });

  describe('updates', () => {
    it('shows the current version', async () => {
      render(SettingsModal);
      expect(await screen.findByText('Current version v0.7.0')).toBeTruthy();
    });

    it('shows a placeholder when the version is unavailable', async () => {
      vi.mocked(GetVersion).mockRejectedValue('runtime unavailable');
      render(SettingsModal);
      expect(await screen.findByText('Current version —')).toBeTruthy();
    });

    it('does not check for updates until asked', async () => {
      render(SettingsModal);
      await screen.findByText('Current version v0.7.0');
      expect(GetAvailableUpdate).not.toHaveBeenCalled();
    });

    it('reports when the app is up to date', async () => {
      vi.mocked(GetAvailableUpdate).mockResolvedValue('');
      render(SettingsModal);

      await checkForUpdates();

      expect(await screen.findByText("You're up to date")).toBeTruthy();
      expect(CheckForUpdates).not.toHaveBeenCalled();
    });

    it('disables the button while checking', async () => {
      const pending = deferred<string>();
      vi.mocked(GetAvailableUpdate).mockReturnValue(pending.promise as never);
      render(SettingsModal);

      await checkForUpdates();

      const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Check for updates' });
      await vi.waitFor(() => expect(button.disabled).toBe(true));
      expect(button.querySelector('.loading')).toBeTruthy();

      pending.resolve('');
      expect(await screen.findByText("You're up to date")).toBeTruthy();
      expect(button.disabled).toBe(false);
    });

    it('offers the new version and opens the update window', async () => {
      vi.mocked(GetAvailableUpdate).mockResolvedValue('0.8.0');
      render(SettingsModal);

      await checkForUpdates();

      expect(await screen.findByText('Version v0.8.0 is available')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull();

      await fireEvent.click(screen.getByRole('button', { name: 'Update to v0.8.0' }));

      expect(CheckForUpdates).toHaveBeenCalledOnce();
      expect(appState.showSettings).toBe(false);
    });

    it('shows the error and allows a retry when the check fails', async () => {
      vi.mocked(GetAvailableUpdate).mockRejectedValueOnce('update check failed: offline');
      render(SettingsModal);

      await checkForUpdates();
      expect(await screen.findByText('update check failed: offline')).toBeTruthy();

      vi.mocked(GetAvailableUpdate).mockResolvedValue('');
      await checkForUpdates();
      expect(await screen.findByText("You're up to date")).toBeTruthy();
      expect(screen.queryByText('update check failed: offline')).toBeNull();
    });
  });

  describe('general settings', () => {
    it('starts from the current settings', () => {
      appState.settings = {
        ...appState.settings,
        defaultDownloadPath: '/home/me/Downloads',
        pageSize: 250,
        showFileDetails: false,
      };
      render(SettingsModal);

      expect(screen.getByPlaceholderText<HTMLInputElement>('Default download folder').value).toBe(
        '/home/me/Downloads'
      );
      expect(screen.getByLabelText<HTMLSelectElement>('Items per page').value).toBe('250');
      expect(
        screen.getByLabelText<HTMLInputElement>('Show file details (size, type, modified)').checked
      ).toBe(false);
    });

    it('saves the edited settings and closes', async () => {
      render(SettingsModal);

      await fireEvent.click(screen.getByLabelText('Ask for save location before each download'));
      await fireEvent.click(screen.getByLabelText('Show file details (size, type, modified)'));
      await fireEvent.change(screen.getByLabelText('Items per page'), { target: { value: '100' } });
      await fireEvent.input(screen.getByPlaceholderText('Default download folder'), {
        target: { value: '/data' },
      });
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await vi.waitFor(() => expect(appState.showSettings).toBe(false));

      const saved = {
        defaultDownloadPath: '/data',
        askBeforeDownload: false,
        showFileDetails: false,
        theme: 'night',
        pageSize: 100,
      };
      expect(SaveSettings).toHaveBeenCalledWith(saved);
      expect(appState.settings).toEqual(saved);
      expect(appState.notification).toEqual({ message: 'Settings saved', type: 'success' });
    });

    it('keeps the modal open and the old settings when saving fails', async () => {
      vi.mocked(SaveSettings).mockRejectedValue('disk full');
      render(SettingsModal);

      await fireEvent.click(screen.getByLabelText('Ask for save location before each download'));
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({ message: 'Save failed: disk full', type: 'error' })
      );
      expect(appState.showSettings).toBe(true);
      expect(appState.settings.askBeforeDownload).toBe(true);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(false);
    });

    it('disables save while saving', async () => {
      const pending = deferred<void>();
      vi.mocked(SaveSettings).mockReturnValue(pending.promise as never);
      render(SettingsModal);
      const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });

      await fireEvent.click(save);
      await vi.waitFor(() => expect(save.disabled).toBe(true));

      pending.resolve();
      await vi.waitFor(() => expect(appState.showSettings).toBe(false));
    });

    it('fills the download folder from the directory picker', async () => {
      vi.mocked(OpenDirectoryDialog).mockResolvedValue('/mnt/downloads');
      render(SettingsModal);
      const input = screen.getByPlaceholderText<HTMLInputElement>('Default download folder');

      await fireEvent.click(screen.getByRole('button', { name: 'Browse' }));

      await vi.waitFor(() => expect(input.value).toBe('/mnt/downloads'));
    });

    it('keeps the download folder when the picker is cancelled', async () => {
      appState.settings.defaultDownloadPath = '/home/me/Downloads';
      vi.mocked(OpenDirectoryDialog).mockResolvedValue('');
      render(SettingsModal);

      await fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
      await vi.waitFor(() => expect(OpenDirectoryDialog).toHaveBeenCalled());

      expect(screen.getByPlaceholderText<HTMLInputElement>('Default download folder').value).toBe(
        '/home/me/Downloads'
      );
    });
  });

  describe('closing', () => {
    it('discards edits on cancel', async () => {
      render(SettingsModal);

      await fireEvent.click(screen.getByLabelText('Ask for save location before each download'));
      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(appState.showSettings).toBe(false);
      expect(appState.settings.askBeforeDownload).toBe(true);
      expect(SaveSettings).not.toHaveBeenCalled();
    });

    it('closes from the close button', async () => {
      render(SettingsModal);
      await fireEvent.click(screen.getByRole('button', { name: '✕' }));
      expect(appState.showSettings).toBe(false);
    });

    it('closes on a backdrop click but not on a click inside the dialog', async () => {
      const { container } = render(SettingsModal);

      await fireEvent.click(screen.getByText('Settings'));
      expect(appState.showSettings).toBe(true);

      await fireEvent.click(container.querySelector('.absolute')!);
      expect(appState.showSettings).toBe(false);
    });
  });

  describe('connection', () => {
    it('shows the saved connection', async () => {
      await openConnectionTab();

      expect(screen.getByLabelText<HTMLInputElement>('Access Key').value).toBe('osodev');
      expect(screen.getByLabelText<HTMLInputElement>('Secret Key').type).toBe('password');
      expect(screen.getByLabelText<HTMLInputElement>('Region').value).toBe('eu-west-1');
    });

    it('falls back to an empty form when no config is saved', async () => {
      vi.mocked(GetSavedConfig).mockResolvedValue(null);
      render(SettingsModal);
      await fireEvent.click(screen.getByRole('button', { name: 'Connection' }));

      expect(screen.getByLabelText<HTMLInputElement>('Endpoint URL').value).toBe('');
      expect(screen.getByLabelText<HTMLInputElement>('Region').value).toBe('us-east-1');
    });

    it('survives a failure to read the saved config', async () => {
      vi.mocked(GetSavedConfig).mockRejectedValue('runtime unavailable');
      render(SettingsModal);
      await fireEvent.click(screen.getByRole('button', { name: 'Connection' }));

      expect(screen.getByLabelText<HTMLInputElement>('Endpoint URL').value).toBe('');
    });

    it('switches back to the general tab', async () => {
      await openConnectionTab();
      await fireEvent.click(screen.getByRole('button', { name: 'General' }));
      expect(screen.getByText('Downloads')).toBeTruthy();
    });

    it('reconnects with the edited values', async () => {
      await openConnectionTab();
      await fireEvent.input(screen.getByLabelText('Endpoint URL'), {
        target: { value: 'http://minio:9000' },
      });

      await fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({
          message: 'Reconnected successfully',
          type: 'success',
        })
      );
      expect(Connect).toHaveBeenCalledWith({ ...savedConfig, endpoint: 'http://minio:9000' });
    });

    it('shows a reconnect error and clears it on the next attempt', async () => {
      vi.mocked(Connect).mockRejectedValueOnce('connection failed: access denied');
      await openConnectionTab();
      const reconnect = screen.getByRole<HTMLButtonElement>('button', { name: 'Reconnect' });

      await fireEvent.click(reconnect);
      expect(await screen.findByText('connection failed: access denied')).toBeTruthy();
      expect(reconnect.disabled).toBe(false);

      await fireEvent.click(reconnect);
      await vi.waitFor(() =>
        expect(screen.queryByText('connection failed: access denied')).toBeNull()
      );
    });

    it('disables reconnect while connecting', async () => {
      const pending = deferred<void>();
      vi.mocked(Connect).mockReturnValue(pending.promise as never);
      await openConnectionTab();
      const reconnect = screen.getByRole<HTMLButtonElement>('button', { name: 'Reconnect' });

      await fireEvent.click(reconnect);
      await vi.waitFor(() => expect(reconnect.disabled).toBe(true));

      pending.resolve();
      await vi.waitFor(() => expect(reconnect.disabled).toBe(false));
    });

    it('disconnects and returns to the setup screen state', async () => {
      appState.connected = true;
      appState.currentBucket = 'b';
      appState.buckets = [{ name: 'b', creationDate: '' }];
      appState.objects = [file('a.txt')];
      await openConnectionTab();

      await fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

      expect(Disconnect).toHaveBeenCalledOnce();
      expect(appState.connected).toBe(false);
      expect(appState.currentBucket).toBeNull();
      expect(appState.buckets).toEqual([]);
      expect(appState.objects).toEqual([]);
      expect(appState.showSettings).toBe(false);
    });
  });
});
