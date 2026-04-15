// Global application state using Svelte 5 runes

export interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  region: string;
}

export interface AppSettings {
  defaultDownloadPath: string;
  askBeforeDownload: boolean;
  showFileDetails: boolean;
}

export interface Bucket {
  name: string;
  creationDate: string;
}

export interface S3Object {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  isFolder: boolean;
  etag: string;
}

export interface ListObjectsResult {
  objects: S3Object[];
  nextContinuationToken: string;
  hasMore: boolean;
}

export interface UploadEntry {
  key: string;
  progress: number;
  done: boolean;
  error?: string;
}

export type ClipboardEntry = {
  operation: 'copy' | 'cut';
  bucket: string;
  keys: string[];
} | null;

export type NotificationType = 'success' | 'error' | 'info';

class AppState {
  // Connection status
  connected = $state(false);

  // Bucket list
  buckets = $state<Bucket[]>([]);
  bucketsLoading = $state(false);

  // Current navigation state
  currentBucket = $state<string | null>(null);
  currentPrefix = $state('');

  // File listing
  objects = $state<S3Object[]>([]);
  continuationToken = $state('');
  hasMore = $state(false);
  isLoading = $state(false);

  // Selection
  selectedKeys = $state<Set<string>>(new Set());

  // Clipboard for copy/cut operations
  clipboard = $state<ClipboardEntry>(null);

  // Upload progress tracking
  uploads = $state<Record<string, UploadEntry>>({});

  // Application settings
  settings = $state<AppSettings>({
    defaultDownloadPath: '',
    askBeforeDownload: true,
    showFileDetails: true,
  });

  // Modal visibility
  showSettings = $state(false);
  showPresignedUrl = $state(false);
  showDeleteConfirm = $state(false);
  showNewFolder = $state(false);

  // Search / filter
  searchQuery = $state('');

  // Presigned URL target
  presignedUrlTarget = $state<{ bucket: string; key: string; name: string } | null>(null);

  // Delete operation target
  deleteTarget = $state<{ bucket: string; keys: string[]; hasFolder: boolean } | null>(null);

  // Refresh trigger — increment to force a reload
  refreshTrigger = $state(0);

  // Toast notification
  notification = $state<{ message: string; type: NotificationType } | null>(null);

  notify(message: string, type: NotificationType = 'info') {
    this.notification = { message, type };
    setTimeout(() => {
      this.notification = null;
    }, 3500);
  }
}

export const appState = new AppState();
