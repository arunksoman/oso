import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appState } from './appState.svelte';

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
});
