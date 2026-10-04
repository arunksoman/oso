import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appState } from './appState.svelte';
import { file } from '../../test/helpers';

describe('appState', () => {
  it('starts disconnected with default settings', () => {
    expect(appState.connected).toBe(false);
    expect(appState.currentBucket).toBeNull();
    expect(appState.settings).toEqual({
      defaultDownloadPath: '',
      askBeforeDownload: true,
      showFileDetails: true,
      theme: 'night',
      pageSize: 1000,
    });
  });

  describe('notify', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    it('defaults to the info type', () => {
      appState.notify('hello');
      expect(appState.notification).toEqual({ message: 'hello', type: 'info' });
    });

    it('clears the notification after 3.5 seconds', () => {
      appState.notify('saved', 'success');
      expect(appState.notification).toEqual({ message: 'saved', type: 'success' });

      vi.advanceTimersByTime(3499);
      expect(appState.notification).not.toBeNull();

      vi.advanceTimersByTime(1);
      expect(appState.notification).toBeNull();
    });
  });

  describe('applySettings', () => {
    it('merges the given settings', () => {
      appState.applySettings({ pageSize: 250, theme: 'light' });

      expect(appState.settings.pageSize).toBe(250);
      expect(appState.settings.theme).toBe('light');
      expect(appState.settings.askBeforeDownload).toBe(true);
    });

    it('keeps the theme when none is given and rejects unknown ones', () => {
      appState.applySettings({ theme: 'light' });
      appState.applySettings({ pageSize: 100 });
      expect(appState.settings.theme).toBe('light');

      appState.applySettings({ theme: 'solarized' });
      expect(appState.settings.theme).toBe('night');
    });
  });

  describe('applyConnection', () => {
    function browse() {
      appState.connected = true;
      appState.activeProfileId = 'work';
      appState.buckets = [{ name: 'b', creationDate: '' }];
      appState.currentBucket = 'b';
      appState.currentPrefix = 'docs/';
      appState.objects = [file('docs/a.txt')];
      appState.continuationToken = 'token';
      appState.hasMore = true;
      appState.selectedKeys = new Set(['docs/a.txt']);
      appState.clipboard = { operation: 'copy', bucket: 'b', keys: ['docs/a.txt'] };
      appState.searchQuery = 'a';
      appState.propertiesTarget = { bucket: 'b', key: 'docs/a.txt', name: 'a.txt' };
      appState.deleteBucketTarget = 'b';
    }

    it('forgets the old connection when another profile becomes active', () => {
      browse();

      appState.applyConnection('home', true);

      expect(appState.activeProfileId).toBe('home');
      expect(appState.buckets).toEqual([]);
      expect(appState.currentBucket).toBeNull();
      expect(appState.currentPrefix).toBe('');
      expect(appState.objects).toEqual([]);
      expect(appState.continuationToken).toBe('');
      expect(appState.hasMore).toBe(false);
      expect(appState.selectedKeys.size).toBe(0);
      expect(appState.clipboard).toBeNull();
      expect(appState.searchQuery).toBe('');
      expect(appState.propertiesTarget).toBeNull();
      expect(appState.deleteBucketTarget).toBeNull();
      expect(appState.bucketsTrigger).toBe(1);
    });

    it('keeps the navigation when nothing changed', () => {
      browse();

      appState.applyConnection('work', true);

      expect(appState.currentBucket).toBe('b');
      expect(appState.bucketsTrigger).toBe(0);
    });

    it('resets on disconnect', () => {
      browse();

      appState.applyConnection('', false);

      expect(appState.connected).toBe(false);
      expect(appState.currentBucket).toBeNull();
    });
  });
});
