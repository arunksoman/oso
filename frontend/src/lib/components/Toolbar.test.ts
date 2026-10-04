import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import {
  OpenDirectoryDialog,
  OpenMultipleFilesDialog,
  UploadFile,
  UploadFiles,
  OpenSettingsWindow,
} from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import { deferred, file } from '../../test/helpers';
import Toolbar from './Toolbar.svelte';

const uploadFiles = () => fireEvent.click(screen.getByRole('button', { name: 'Upload files' }));
const uploadFolder = () => fireEvent.click(screen.getByRole('button', { name: 'Upload folder' }));

describe('Toolbar', () => {
  describe('without a bucket', () => {
    it('hides navigation and disables new folder', () => {
      render(Toolbar);
      expect(screen.queryByTitle('Go to parent folder')).toBeNull();
      expect(screen.getByTitle<HTMLButtonElement>('New folder').disabled).toBe(true);
    });

    it('refuses to upload files', async () => {
      render(Toolbar);
      await uploadFiles();
      expect(appState.notification).toEqual({ message: 'Select a bucket first', type: 'error' });
      expect(OpenMultipleFilesDialog).not.toHaveBeenCalled();
    });

    it('refuses to upload a folder', async () => {
      render(Toolbar);
      await uploadFolder();
      expect(appState.notification).toEqual({ message: 'Select a bucket first', type: 'error' });
      expect(OpenDirectoryDialog).not.toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    it('is disabled at the bucket root', () => {
      appState.currentBucket = 'b';
      render(Toolbar);
      expect(screen.getByTitle<HTMLButtonElement>('Go to parent folder').disabled).toBe(true);
      expect(screen.getByTitle<HTMLButtonElement>('Back / Parent folder').disabled).toBe(true);
    });

    it('goes up one folder at a time and resets the listing', async () => {
      appState.currentBucket = 'b';
      appState.currentPrefix = 'a/b/';
      appState.objects = [file('a/b/x.txt')];
      appState.continuationToken = 'token';
      appState.selectedKeys = new Set(['a/b/x.txt']);
      render(Toolbar);

      await fireEvent.click(screen.getByTitle('Go to parent folder'));
      expect(appState.currentPrefix).toBe('a/');
      expect(appState.objects).toEqual([]);
      expect(appState.continuationToken).toBe('');
      expect(appState.selectedKeys.size).toBe(0);

      await fireEvent.click(screen.getByTitle('Back / Parent folder'));
      expect(appState.currentPrefix).toBe('');
    });
  });

  describe('actions', () => {
    it('triggers a refresh', async () => {
      render(Toolbar);
      await fireEvent.click(screen.getByTitle('Refresh'));
      expect(appState.refreshTrigger).toBeGreaterThan(0);
    });

    it('opens the new folder bar', async () => {
      appState.currentBucket = 'b';
      render(Toolbar);
      await fireEvent.click(screen.getByTitle('New folder'));
      expect(appState.showNewFolder).toBe(true);
    });

    it('opens the settings window', async () => {
      vi.mocked(OpenSettingsWindow).mockResolvedValue(true);
      render(Toolbar);

      await fireEvent.click(screen.getByTitle('Settings'));

      await vi.waitFor(() => expect(OpenSettingsWindow).toHaveBeenCalledWith(''));
      expect(window.open).not.toHaveBeenCalled();
    });

    it('opens the settings page in server mode, which has no windows', async () => {
      vi.mocked(OpenSettingsWindow).mockResolvedValue(false);
      render(Toolbar);

      await fireEvent.click(screen.getByTitle('Settings'));

      await vi.waitFor(() => expect(window.open).toHaveBeenCalledWith('/settings', 'oso-settings'));
    });
  });

  describe('upload files', () => {
    it('does nothing when the dialog is cancelled', async () => {
      appState.currentBucket = 'b';
      vi.mocked(OpenMultipleFilesDialog).mockResolvedValue([]);
      render(Toolbar);

      await uploadFiles();
      await vi.waitFor(() => expect(OpenMultipleFilesDialog).toHaveBeenCalled());

      expect(UploadFiles).not.toHaveBeenCalled();
      expect(appState.refreshTrigger).toBe(0);
    });

    it('uploads a single file into the current folder', async () => {
      appState.currentBucket = 'b';
      appState.currentPrefix = 'docs/';
      vi.mocked(OpenMultipleFilesDialog).mockResolvedValue(['/home/me/report.pdf']);
      render(Toolbar);

      await uploadFiles();
      await vi.waitFor(() => expect(appState.refreshTrigger).toBeGreaterThan(0));

      expect(UploadFiles).toHaveBeenCalledWith('b', 'docs/', ['/home/me/report.pdf']);
      expect(appState.notification).toEqual({ message: 'Uploaded "report.pdf"', type: 'success' });
      expect(appState.uploadBatch).toBeNull();
    });

    it('starts a batch for several files', async () => {
      appState.currentBucket = 'b';
      vi.mocked(OpenMultipleFilesDialog).mockResolvedValue(['/a.txt', '/b.txt', '/c.txt']);
      render(Toolbar);

      await uploadFiles();
      await vi.waitFor(() => expect(appState.refreshTrigger).toBeGreaterThan(0));

      expect(appState.uploadBatch).toEqual({ total: 3, done: 0, errors: 0 });
      expect(appState.notification).toBeNull();
    });

    it('reports a failure and drops the batch', async () => {
      appState.currentBucket = 'b';
      vi.mocked(OpenMultipleFilesDialog).mockResolvedValue(['/a.txt', '/b.txt']);
      vi.mocked(UploadFiles).mockRejectedValue('disk error');
      render(Toolbar);

      await uploadFiles();
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(appState.notification).toEqual({ message: 'Upload failed: disk error', type: 'error' });
      expect(appState.uploadBatch).toBeNull();
    });

    it('shows a spinner while uploading', async () => {
      appState.currentBucket = 'b';
      const pending = deferred<void>();
      vi.mocked(OpenMultipleFilesDialog).mockResolvedValue(['/a.txt']);
      vi.mocked(UploadFiles).mockReturnValue(pending.promise as never);
      const { container } = render(Toolbar);

      await uploadFiles();
      await vi.waitFor(() => expect(container.querySelector('.loading')).toBeTruthy());

      pending.resolve();
      await vi.waitFor(() => expect(container.querySelector('.loading')).toBeNull());
    });
  });

  describe('upload folder', () => {
    it('does nothing when the dialog is cancelled', async () => {
      appState.currentBucket = 'b';
      vi.mocked(OpenDirectoryDialog).mockResolvedValue('');
      render(Toolbar);

      await uploadFolder();
      await vi.waitFor(() => expect(OpenDirectoryDialog).toHaveBeenCalled());

      expect(UploadFile).not.toHaveBeenCalled();
    });

    it('uploads the chosen folder into the current folder', async () => {
      appState.currentBucket = 'b';
      appState.currentPrefix = 'backup/';
      vi.mocked(OpenDirectoryDialog).mockResolvedValue('/home/me/photos');
      render(Toolbar);

      await uploadFolder();

      await vi.waitFor(() =>
        expect(UploadFile).toHaveBeenCalledWith('b', 'backup/', '/home/me/photos')
      );
    });

    it('reports a failure and drops the batch', async () => {
      appState.currentBucket = 'b';
      appState.uploadBatch = { total: 4, done: 1, errors: 0 };
      vi.mocked(OpenDirectoryDialog).mockResolvedValue('/home/me/photos');
      vi.mocked(UploadFile).mockRejectedValue('disk error');
      render(Toolbar);

      await uploadFolder();
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(appState.notification).toEqual({ message: 'Upload failed: disk error', type: 'error' });
      expect(appState.uploadBatch).toBeNull();
    });
  });
});
