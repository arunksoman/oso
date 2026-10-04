// Global application state using Svelte 5 runes

export interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  region: string;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  region: string;
  readOnly: boolean;
}

export interface ObjectProperties {
  bucket: string;
  key: string;
  size: number;
  lastModified: string;
  contentType: string;
  etag: string;
  storageClass: string;
  versionId: string;
  cacheControl: string;
  contentDisposition: string;
  contentEncoding: string;
  metadata: Record<string, string>;
  tags: Record<string, string>;
}

export type Theme = 'night' | 'light';

export interface AppSettings {
  defaultDownloadPath: string;
  askBeforeDownload: boolean;
  showFileDetails: boolean;
  theme: Theme;
  pageSize: number;
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

export interface UploadBatch {
  total: number;
  done: number;
  errors: number;
}

export type ClipboardEntry = {
  operation: 'copy' | 'cut';
  bucket: string;
  keys: string[];
} | null;

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

class AppState {
  // Connection status
  connected = $state(false);

  // Saved connection profiles and the one in use
  profiles = $state<ConnectionProfile[]>([]);
  activeProfileId = $state('');

  // Bucket list
  buckets = $state<Bucket[]>([]);
  bucketsLoading = $state(false);
  // Increment to reload the bucket list
  bucketsTrigger = $state(0);

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

  // Batch upload progress (multi-file only)
  uploadBatch = $state<UploadBatch | null>(null);

  // Application settings
  settings = $state<AppSettings>({
    defaultDownloadPath: '',
    askBeforeDownload: true,
    showFileDetails: true,
    theme: 'night',
    pageSize: 1000,
  });

  // Modal visibility
  showPresignedUrl = $state(false);
  showDeleteConfirm = $state(false);
  showNewFolder = $state(false);

  // Search / filter
  searchQuery = $state('');

  // Presigned URL target
  presignedUrlTarget = $state<{ bucket: string; key: string; name: string } | null>(null);

  // Delete operation target
  deleteTarget = $state<{ bucket: string; keys: string[]; hasFolder: boolean } | null>(null);

  // Bucket waiting for its delete confirmation
  deleteBucketTarget = $state<string | null>(null);

  // Object shown in the properties panel
  propertiesTarget = $state<{ bucket: string; key: string; name: string } | null>(null);

  // Refresh trigger — increment to force a reload
  refreshTrigger = $state(0);

  // Toast notification
  notification = $state<{ message: string; type: NotificationType } | null>(null);

  /** Take over settings saved by any window; unknown themes fall back to night */
  applySettings(settings: Partial<Omit<AppSettings, 'theme'>> & { theme?: string }) {
    this.settings = {
      ...this.settings,
      ...settings,
      theme: (settings.theme ?? this.settings.theme) === 'light' ? 'light' : 'night',
    };
  }

  /** Forget everything that belongs to the current connection */
  resetNavigation() {
    this.buckets = [];
    this.currentBucket = null;
    this.currentPrefix = '';
    this.objects = [];
    this.continuationToken = '';
    this.hasMore = false;
    this.selectedKeys = new Set();
    this.clipboard = null;
    this.searchQuery = '';
    this.propertiesTarget = null;
    this.deleteBucketTarget = null;
  }

  /** Follow a connection change made by this or another window */
  applyConnection(activeProfileId: string, connected: boolean) {
    const changed = activeProfileId !== this.activeProfileId || connected !== this.connected;
    this.activeProfileId = activeProfileId;
    this.connected = connected;
    if (changed) {
      this.resetNavigation();
      this.bucketsTrigger++;
    }
  }

  notify(message: string, type: NotificationType = 'info') {
    this.notification = { message, type };
    setTimeout(() => {
      this.notification = null;
    }, 3500);
  }
}

export const appState = new AppState();
