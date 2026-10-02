import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import {
  GetAvailableUpdate,
  GetPresignedURL,
  GetSettings,
  GetVersion,
  IsConnected,
  ListBuckets,
} from '$bindings/oso/app';
import { Events } from '@wailsio/runtime';
import { appState } from '$lib/stores/appState.svelte';
import type { NotificationType } from '$lib/stores/appState.svelte';
import { deferred } from '../test/helpers';
import Page from './+page.svelte';

type Handler = (event: { data: Record<string, unknown> }) => void;

/** Emit a backend event to the listener the page registered */
function emit(name: string, data: Record<string, unknown>) {
  const call = vi.mocked(Events.On).mock.calls.find(([event]) => event === name);
  if (!call) throw new Error(`no listener registered for ${name}`);
  (call[1] as unknown as Handler)({ data });
}

async function openShell() {
  vi.mocked(IsConnected).mockResolvedValue(true);
  const view = render(Page);
  await screen.findByText('Buckets');
  return view;
}

describe('+page', () => {
  beforeEach(() => {
    vi.mocked(GetSettings).mockResolvedValue({
      defaultDownloadPath: '/home/me/Downloads',
      askBeforeDownload: false,
      showFileDetails: false,
      pageSize: 250,
    });
    vi.mocked(ListBuckets).mockResolvedValue([]);
    vi.mocked(GetVersion).mockResolvedValue('0.7.0');
    vi.mocked(GetAvailableUpdate).mockResolvedValue('');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('startup', () => {
    it('shows a splash until the connection check finishes', async () => {
      const pending = deferred<boolean>();
      vi.mocked(IsConnected).mockReturnValue(pending.promise as never);
      const { container } = render(Page);

      expect(container.querySelector('.loading')).toBeTruthy();
      expect(screen.queryByText('Object Storage Operator')).toBeNull();

      pending.resolve(false);
      expect(await screen.findByText('Object Storage Operator')).toBeTruthy();
    });

    it('shows the setup screen when not connected', async () => {
      vi.mocked(IsConnected).mockResolvedValue(false);
      render(Page);

      expect(await screen.findByText('Object Storage Operator')).toBeTruthy();
      expect(GetSettings).not.toHaveBeenCalled();
    });

    it('loads settings and shows the shell when connected', async () => {
      await openShell();

      expect(screen.getByText('Select a bucket from the sidebar')).toBeTruthy();
      expect(appState.settings).toEqual({
        defaultDownloadPath: '/home/me/Downloads',
        askBeforeDownload: false,
        showFileDetails: false,
        pageSize: 250,
        theme: 'night',
      });
    });

    it('falls back to the setup screen when startup fails', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(IsConnected).mockRejectedValue('runtime unavailable');
      render(Page);

      expect(await screen.findByText('Object Storage Operator')).toBeTruthy();
      expect(error).toHaveBeenCalledWith('Startup error:', 'runtime unavailable');
    });

    it('registers every upload event', async () => {
      await openShell();
      expect(vi.mocked(Events.On).mock.calls.map(([name]) => name).sort()).toEqual([
        'upload:done',
        'upload:error',
        'upload:folder:start',
        'upload:progress',
      ]);
    });
  });

  describe('single file upload events', () => {
    it('tracks progress, completion and cleanup', async () => {
      await openShell();
      vi.useFakeTimers();

      emit('upload:progress', { key: 'docs/a.txt', progress: 40 });
      expect(appState.uploads).toEqual({
        'docs/a.txt': { key: 'docs/a.txt', progress: 40, done: false },
      });

      emit('upload:done', { key: 'docs/a.txt' });
      expect(appState.uploads['docs/a.txt']).toEqual({ key: 'docs/a.txt', progress: 100, done: true });

      vi.advanceTimersByTime(4000);
      expect(appState.uploads).toEqual({});
    });

    it('keeps a failed upload visible with its error', async () => {
      await openShell();

      emit('upload:error', { key: 'docs/a.txt', error: 'access denied' });

      expect(appState.uploads['docs/a.txt']).toEqual({
        key: 'docs/a.txt',
        progress: 0,
        done: false,
        error: 'access denied',
      });
      expect(await screen.findByText('access denied')).toBeTruthy();
    });
  });

  describe('batch upload events', () => {
    it('starts a batch when a folder upload begins', async () => {
      await openShell();

      emit('upload:folder:start', { total: 3 });

      expect(appState.uploadBatch).toEqual({ total: 3, done: 0, errors: 0 });
      expect(await screen.findByText('Uploading 1 of 3…')).toBeTruthy();
    });

    it('counts files, ignores per-file progress and finishes after two seconds', async () => {
      await openShell();
      vi.useFakeTimers();
      emit('upload:folder:start', { total: 2 });

      emit('upload:progress', { key: 'a.txt', progress: 50 });
      expect(appState.uploads).toEqual({});

      emit('upload:done', { key: 'a.txt' });
      expect(appState.uploadBatch).toEqual({ total: 2, done: 1, errors: 0 });
      expect(appState.refreshTrigger).toBe(0);

      emit('upload:done', { key: 'b.txt' });
      expect(appState.uploadBatch).toEqual({ total: 2, done: 2, errors: 0 });
      expect(appState.refreshTrigger).toBeGreaterThan(0);

      vi.advanceTimersByTime(2000);
      expect(appState.uploadBatch).toBeNull();
    });

    it('counts failures towards the end of the batch', async () => {
      await openShell();
      vi.useFakeTimers();
      emit('upload:folder:start', { total: 2 });

      emit('upload:error', { key: 'a.txt', error: 'denied' });
      expect(appState.uploadBatch).toEqual({ total: 2, done: 0, errors: 1 });
      expect(appState.uploads).toEqual({});
      expect(appState.refreshTrigger).toBe(0);

      emit('upload:error', { key: 'b.txt', error: 'denied' });
      expect(appState.uploadBatch).toEqual({ total: 2, done: 0, errors: 2 });
      expect(appState.refreshTrigger).toBeGreaterThan(0);

      vi.advanceTimersByTime(2000);
      expect(appState.uploadBatch).toBeNull();
    });
  });

  describe('modals', () => {
    it('renders each modal from its flag', async () => {
      vi.mocked(GetPresignedURL).mockResolvedValue('https://s3.example/signed');
      await openShell();

      appState.showSettings = true;
      expect(await screen.findByText('Settings')).toBeTruthy();
      appState.showSettings = false;

      appState.deleteTarget = { bucket: 'b', keys: ['a.txt'], hasFolder: false };
      appState.showDeleteConfirm = true;
      expect(await screen.findByText('Confirm Delete')).toBeTruthy();
      appState.showDeleteConfirm = false;

      appState.presignedUrlTarget = { bucket: 'b', key: 'a.txt', name: 'a.txt' };
      appState.showPresignedUrl = true;
      expect(await screen.findByText('Presigned URL')).toBeTruthy();
    });
  });

  describe('toast', () => {
    it.each<[NotificationType, string]>([
      ['success', 'bg-success'],
      ['error', 'bg-error'],
      ['warning', 'bg-warning'],
      ['info', 'bg-info'],
    ])('colours a %s toast', async (type, accent) => {
      const { container } = await openShell();

      appState.notification = { message: `a ${type} message`, type };

      expect(await screen.findByText(`a ${type} message`)).toBeTruthy();
      expect(container.querySelector(`.${accent}`)).toBeTruthy();
    });

    it('copies the message and can be dismissed', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await openShell();
      appState.notification = { message: 'Load failed: timeout', type: 'error' };

      await fireEvent.click(await screen.findByTitle('Copy to clipboard'));
      expect(writeText).toHaveBeenCalledWith('Load failed: timeout');

      await fireEvent.click(screen.getByTitle('Dismiss'));
      await tick();
      expect(appState.notification).toBeNull();
      expect(screen.queryByText('Load failed: timeout')).toBeNull();
    });
  });
});
