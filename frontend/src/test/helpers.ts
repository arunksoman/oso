import { appState } from '$lib/stores/appState.svelte';
import type { S3Object } from '$lib/stores/appState.svelte';

/** Restore the shared store to its startup state */
export function resetAppState() {
  appState.connected = false;
  appState.buckets = [];
  appState.bucketsLoading = false;
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
  appState.showSettings = false;
  appState.showPresignedUrl = false;
  appState.showDeleteConfirm = false;
  appState.showNewFolder = false;
  appState.searchQuery = '';
  appState.presignedUrlTarget = null;
  appState.deleteTarget = null;
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
