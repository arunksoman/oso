import { vi } from 'vitest';
import { Events } from '@wailsio/runtime';
import { appState } from '$lib/stores/appState.svelte';
import type { ConnectionProfile, S3Object } from '$lib/stores/appState.svelte';

/** Restore the shared store to its startup state */
export function resetAppState() {
  appState.connected = false;
  appState.profiles = [];
  appState.activeProfileId = '';
  appState.buckets = [];
  appState.bucketsLoading = false;
  appState.bucketsTrigger = 0;
  appState.currentBucket = null;
  appState.currentPrefix = '';
  appState.objects = [];
  appState.continuationToken = '';
  appState.hasMore = false;
  appState.isLoading = false;
  appState.selectedKeys = new Set();
  appState.clipboard = null;
  appState.uploads = {};
  appState.uploadBatch = null;
  appState.settings = {
    defaultDownloadPath: '',
    askBeforeDownload: true,
    showFileDetails: true,
    theme: 'night',
    pageSize: 1000,
  };
  appState.showPresignedUrl = false;
  appState.showDeleteConfirm = false;
  appState.showNewFolder = false;
  appState.searchQuery = '';
  appState.presignedUrlTarget = null;
  appState.deleteTarget = null;
  appState.deleteBucketTarget = null;
  appState.propertiesTarget = null;
  appState.refreshTrigger = 0;
  appState.notification = null;
}

export function file(key: string, size = 10): S3Object {
  return {
    key,
    name: key.split('/').pop() ?? key,
    size,
    lastModified: '2026-01-02T03:04:05Z',
    isFolder: false,
    etag: 'etag',
  };
}

export function folder(key: string): S3Object {
  return {
    key,
    name: key.split('/').filter(Boolean).pop() ?? key,
    size: 0,
    lastModified: '',
    isFolder: true,
    etag: '',
  };
}

/** A promise the test resolves or rejects by hand, to observe pending states */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function profile(id: string, overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    id,
    name: `Profile ${id}`,
    endpoint: `http://${id}.example.com:9000`,
    accessKey: `${id}-key`,
    secretKey: `${id}-secret`,
    region: 'us-east-1',
    readOnly: false,
    ...overrides,
  };
}

type Handler = (event: { data: unknown }) => void;

/** Emit a backend event to every listener the rendered components registered */
export function emitEvent(name: string, data: unknown) {
  const calls = vi.mocked(Events.On).mock.calls.filter(([event]) => event === name);
  if (calls.length === 0) throw new Error(`no listener registered for ${name}`);
  for (const call of calls) (call[1] as unknown as Handler)({ data });
}
