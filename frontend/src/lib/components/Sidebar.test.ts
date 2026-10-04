import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import {
  CheckForUpdates,
  CreateBucket,
  GetAvailableUpdate,
  GetVersion,
  ListBuckets,
  OpenSettingsWindow,
  SwitchProfile,
} from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import { deferred, file, profile } from '../../test/helpers';
import Sidebar from './Sidebar.svelte';

const buckets = [
  { name: 'alpha', creationDate: '2026-01-01T00:00:00Z' },
  { name: 'beta', creationDate: '2026-01-02T00:00:00Z' },
];

async function openNewBucket(name: string) {
  await fireEvent.click(screen.getByTitle('Create new bucket'));
  const input = screen.getByPlaceholderText('new-bucket-name');
  await fireEvent.input(input, { target: { value: name } });
  return input;
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.mocked(ListBuckets).mockResolvedValue(buckets);
    vi.mocked(GetVersion).mockResolvedValue('0.7.0');
    vi.mocked(GetAvailableUpdate).mockResolvedValue('');
  });

  describe('bucket list', () => {
    it('loads and lists buckets', async () => {
      render(Sidebar);
      expect(await screen.findByText('alpha')).toBeTruthy();
      expect(screen.getByText('beta')).toBeTruthy();
      expect(appState.bucketsLoading).toBe(false);
    });

    it('shows a spinner during the first load', async () => {
      const pending = deferred<typeof buckets>();
      vi.mocked(ListBuckets).mockReturnValue(pending.promise as never);
      const { container } = render(Sidebar);

      await vi.waitFor(() => expect(container.querySelector('.loading')).toBeTruthy());
      expect(screen.getByTitle<HTMLButtonElement>('Refresh bucket list').disabled).toBe(true);

      pending.resolve(buckets);
      expect(await screen.findByText('alpha')).toBeTruthy();
    });

    it('handles an empty or missing list', async () => {
      vi.mocked(ListBuckets).mockResolvedValue(null as never);
      render(Sidebar);
      expect(await screen.findByText('No buckets found')).toBeTruthy();
      expect(appState.buckets).toEqual([]);
    });

    it('reports a load failure', async () => {
      vi.mocked(ListBuckets).mockRejectedValue('not connected to S3');
      render(Sidebar);
      await vi.waitFor(() =>
        expect(appState.notification).toEqual({
          message: 'Failed to load buckets: not connected to S3',
          type: 'error',
        })
      );
    });

    it('reloads on refresh', async () => {
      render(Sidebar);
      await screen.findByText('alpha');

      await fireEvent.click(screen.getByTitle('Refresh bucket list'));

      await vi.waitFor(() => expect(ListBuckets).toHaveBeenCalledTimes(2));
    });

    it('selects a bucket and resets navigation', async () => {
      appState.currentPrefix = 'old/';
      appState.objects = [file('old/a.txt')];
      appState.continuationToken = 'token';
      appState.hasMore = true;
      appState.selectedKeys = new Set(['old/a.txt']);
      render(Sidebar);

      await fireEvent.click(await screen.findByText('alpha'));

      expect(appState.currentBucket).toBe('alpha');
      expect(appState.currentPrefix).toBe('');
      expect(appState.objects).toEqual([]);
      expect(appState.continuationToken).toBe('');
      expect(appState.hasMore).toBe(false);
      expect(appState.selectedKeys.size).toBe(0);
      expect(await screen.findByText('s3://alpha')).toBeTruthy();
    });

    it('keeps the listing when the current bucket is clicked again', async () => {
      appState.currentBucket = 'alpha';
      appState.currentPrefix = 'docs/';
      render(Sidebar);

      await fireEvent.click(await screen.findByText('alpha'));

      expect(appState.currentPrefix).toBe('docs/');
    });
  });

  describe('version and updates', () => {
    it('shows the version and opens the update window on click', async () => {
      render(Sidebar);

      await fireEvent.click(await screen.findByTitle('Check for updates'));

      expect(screen.getByText('v0.7.0')).toBeTruthy();
      expect(CheckForUpdates).toHaveBeenCalledOnce();
    });

    it('offers an available update', async () => {
      vi.mocked(GetAvailableUpdate).mockResolvedValue('0.8.0');
      render(Sidebar);

      await fireEvent.click(await screen.findByRole('button', { name: 'Update to v0.8.0' }));

      expect(CheckForUpdates).toHaveBeenCalledOnce();
    });

    it('stays quiet when the startup update check fails', async () => {
      vi.mocked(GetAvailableUpdate).mockRejectedValue('offline');
      render(Sidebar);

      await screen.findByText('v0.7.0');

      expect(screen.queryByRole('button', { name: /Update to/ })).toBeNull();
      expect(appState.notification).toBeNull();
    });
  });

  describe('create bucket', () => {
    it.each([
      ['ab', 'Name must be between 3 and 63 characters'],
      ['a'.repeat(64), 'Name must be between 3 and 63 characters'],
      ['My-Bucket', 'Only lowercase letters, numbers, hyphens, dots. Must start/end with letter or number'],
      ['-bucket', 'Only lowercase letters, numbers, hyphens, dots. Must start/end with letter or number'],
      ['my..bucket', 'Must not contain consecutive dots'],
    ])('rejects %s', async (name, message) => {
      render(Sidebar);
      await openNewBucket(name);

      await fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(screen.getByText(message)).toBeTruthy();
      expect(CreateBucket).not.toHaveBeenCalled();
    });

    it('creates the bucket and reloads the list', async () => {
      render(Sidebar);
      await screen.findByText('alpha');
      await openNewBucket('  new-bucket  ');

      await fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await vi.waitFor(() => expect(ListBuckets).toHaveBeenCalledTimes(2));

      expect(CreateBucket).toHaveBeenCalledWith('new-bucket');
      expect(appState.notification).toEqual({
        message: 'Bucket "new-bucket" created',
        type: 'success',
      });
      expect(screen.queryByPlaceholderText('new-bucket-name')).toBeNull();
    });

    it('creates on Enter', async () => {
      render(Sidebar);
      const input = await openNewBucket('new-bucket');

      await fireEvent.keyDown(input, { key: 'Enter' });

      await vi.waitFor(() => expect(CreateBucket).toHaveBeenCalledWith('new-bucket'));
    });

    it('ignores Enter on an empty name', async () => {
      render(Sidebar);
      const input = await openNewBucket('   ');

      await fireEvent.keyDown(input, { key: 'Enter' });

      expect(CreateBucket).not.toHaveBeenCalled();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create' }).disabled).toBe(true);
    });

    it('reports a server error and keeps the input open', async () => {
      vi.mocked(CreateBucket).mockRejectedValue('failed to create bucket: BucketAlreadyExists');
      render(Sidebar);
      await openNewBucket('taken');

      await fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({
          message: 'failed to create bucket: BucketAlreadyExists',
          type: 'error',
        })
      );
      expect(screen.getByPlaceholderText('new-bucket-name')).toBeTruthy();
    });

    it('shows a spinner while creating', async () => {
      const pending = deferred<void>();
      vi.mocked(CreateBucket).mockReturnValue(pending.promise as never);
      render(Sidebar);
      const input = await openNewBucket('new-bucket');

      await fireEvent.keyDown(input, { key: 'Enter' });

      await vi.waitFor(() =>
        expect(input.parentElement?.querySelector('.loading')).toBeTruthy()
      );
      pending.resolve();
      await vi.waitFor(() => expect(screen.queryByPlaceholderText('new-bucket-name')).toBeNull());
    });

    it('cancels with Escape or the Cancel button and clears the error', async () => {
      render(Sidebar);
      const input = await openNewBucket('ab');
      await fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(screen.getByText('Name must be between 3 and 63 characters')).toBeTruthy();

      await fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByPlaceholderText('new-bucket-name')).toBeNull();

      await openNewBucket('abc');
      expect(screen.queryByText('Name must be between 3 and 63 characters')).toBeNull();
      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByPlaceholderText('new-bucket-name')).toBeNull();
    });
  });

  describe('bucket list changes', () => {
    it('reloads when the bucket trigger changes', async () => {
      render(Sidebar);
      await screen.findByText('alpha');

      appState.bucketsTrigger++;

      await vi.waitFor(() => expect(ListBuckets).toHaveBeenCalledTimes(2));
    });

    it('asks for confirmation before deleting a bucket', async () => {
      render(Sidebar);
      await screen.findByText('alpha');

      await fireEvent.click(screen.getByTitle('Delete bucket beta'));

      expect(appState.deleteBucketTarget).toBe('beta');
      // Asking does not open the bucket
      expect(appState.currentBucket).toBeNull();
    });
  });

  describe('connection switcher', () => {
    const work = profile('work', { name: 'Work' });
    const home = profile('home', { name: 'Home' });

    function withProfiles() {
      appState.profiles = [work, home];
      appState.activeProfileId = 'work';
      appState.connected = true;
    }

    it('shows the active connection', async () => {
      withProfiles();
      render(Sidebar);

      const switcher = screen.getByTitle('Switch connection');
      expect(switcher.textContent).toContain('Work');
      expect(switcher.textContent).toContain('http://work.example.com:9000');
      expect(screen.getByRole('button', { name: /Work/, current: true })).toBeTruthy();
    });

    it('has a placeholder for a connection that is not a saved profile', () => {
      render(Sidebar);
      expect(screen.getByTitle('Switch connection').textContent).toContain('Connection');
      expect(screen.getByRole('button', { name: 'Manage connections' })).toBeTruthy();
    });

    it('switches to another profile and reloads the buckets', async () => {
      withProfiles();
      appState.currentBucket = 'alpha';
      render(Sidebar);
      await screen.findByText('alpha');

      await fireEvent.click(screen.getByRole('button', { name: /Home/ }));
      await vi.waitFor(() => expect(appState.activeProfileId).toBe('home'));

      expect(SwitchProfile).toHaveBeenCalledWith('home');
      expect(appState.currentBucket).toBeNull();
      expect(appState.notification).toEqual({ message: 'Connected to "Home"', type: 'success' });
      await vi.waitFor(() => expect(ListBuckets).toHaveBeenCalledTimes(2));
    });

    it('does nothing when the active profile is chosen', async () => {
      withProfiles();
      render(Sidebar);

      await fireEvent.click(screen.getByRole('button', { name: /Work/, current: true }));

      expect(SwitchProfile).not.toHaveBeenCalled();
    });

    it('keeps the connection and reports a failed switch', async () => {
      withProfiles();
      vi.mocked(SwitchProfile).mockRejectedValue('connection failed: access denied');
      render(Sidebar);

      await fireEvent.click(screen.getByRole('button', { name: /Home/ }));

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({ message: 'connection failed: access denied', type: 'error' })
      );
      expect(appState.activeProfileId).toBe('work');
    });

    it('shows a spinner and ignores a second switch while connecting', async () => {
      withProfiles();
      const pending = deferred<void>();
      vi.mocked(SwitchProfile).mockReturnValue(pending.promise as never);
      render(Sidebar);

      await fireEvent.click(screen.getByRole('button', { name: /Home/ }));
      await vi.waitFor(() =>
        expect(screen.getByTitle('Switch connection').querySelector('.loading')).toBeTruthy()
      );
      await fireEvent.click(screen.getByRole('button', { name: /Home/ }));

      expect(SwitchProfile).toHaveBeenCalledTimes(1);
      pending.resolve();
      await vi.waitFor(() => expect(appState.activeProfileId).toBe('home'));
    });

    it('opens the connections section of the settings window', async () => {
      vi.mocked(OpenSettingsWindow).mockResolvedValue(true);
      withProfiles();
      render(Sidebar);

      await fireEvent.click(screen.getByRole('button', { name: 'Manage connections' }));

      await vi.waitFor(() => expect(OpenSettingsWindow).toHaveBeenCalledWith('connections'));
    });
  });
});
