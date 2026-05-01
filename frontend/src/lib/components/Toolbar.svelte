<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import {
    ArrowLeft02Icon,
    ArrowUp02Icon,
    Refresh01Icon,
    Upload01Icon,
    FolderAddIcon,
    Settings01Icon,
  } from '@hugeicons/core-free-icons';
  import { OpenMultipleFilesDialog, UploadFiles, OpenDirectoryDialog, UploadFile } from '$lib/wailsjs/go/main/App';
  import { appState } from '$lib/stores/appState.svelte';
  import Breadcrumb from './Breadcrumb.svelte';

  let uploading = $state(false);

  async function handleUploadFolder() {
    if (!appState.currentBucket) {
      appState.notify('Select a bucket first', 'error');
      return;
    }
    try {
      const dir = await OpenDirectoryDialog();
      if (!dir) return;
      uploading = true;
      // upload:folder:start event will set uploadBatch; batch panel handles completion
      await UploadFile(appState.currentBucket, appState.currentPrefix, dir);
    } catch (e) {
      appState.notify(`Upload failed: ${e}`, 'error');
      appState.uploadBatch = null;
    } finally {
      uploading = false;
    }
  }

  async function handleUpload() {
    if (!appState.currentBucket) {
      appState.notify('Select a bucket first', 'error');
      return;
    }
    try {
      const files = await OpenMultipleFilesDialog();
      if (!files || files.length === 0) return;
      uploading = true;

      if (files.length > 1) {
        appState.uploadBatch = { total: files.length, done: 0, errors: 0 };
      }

      await UploadFiles(appState.currentBucket, appState.currentPrefix, files);

      if (files.length === 1) {
        appState.notify(`Uploaded "${files[0].split('/').pop()}"`, 'success');
      }
      appState.refreshTrigger = Date.now();
    } catch (e) {
      appState.uploadBatch = null;
      appState.notify(`Upload failed: ${e}`, 'error');
    } finally {
      uploading = false;
    }
  }

  function goUp() {
    if (!appState.currentPrefix) return;
    const parts = appState.currentPrefix.split('/').filter(Boolean);
    parts.pop();
    appState.currentPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
    appState.objects = [];
    appState.continuationToken = '';
    appState.selectedKeys = new Set();
  }

  function goBack() {
    goUp();
  }

  const canGoUp = $derived(!!appState.currentPrefix);
</script>

<div class="flex items-center gap-1.5 px-3 py-2 bg-base-200 border-b border-base-300 shrink-0">
    <!-- Nav buttons (only shown when a bucket is selected) -->
    <div class="flex items-center gap-1.5" style="--wails-draggable: no-drag">
      {#if appState.currentBucket}
        <button
          class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
          onclick={goBack}
          disabled={!canGoUp}
          title="Back / Parent folder"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
        </button>
        <button
          class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
          onclick={goUp}
          disabled={!canGoUp}
          title="Go to parent folder"
        >
          <HugeiconsIcon icon={ArrowUp02Icon} size={16} />
        </button>

        <span class="w-px h-4 bg-base-300 mx-0.5"></span>
      {/if}
    </div>

    <!-- Breadcrumb stays interactive while the toolbar remains the drag surface -->
    <div class="flex-1 min-w-0 px-1">
      <div class="flex items-center min-h-7 px-1">
        <div style="--wails-draggable: no-drag">
          <Breadcrumb />
        </div>
      </div>
    </div>

    <span class="w-px h-4 bg-base-300 mx-0.5"></span>

    <!-- Action buttons -->
    <div class="flex items-center gap-0.5" style="--wails-draggable: no-drag">
      <button
        class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
        onclick={() => { appState.refreshTrigger = Date.now(); }}
        title="Refresh"
      >
        <HugeiconsIcon icon={Refresh01Icon} size={16} />
      </button>

      <button
        class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
        onclick={() => { appState.showNewFolder = true; }}
        disabled={!appState.currentBucket}
        title="New folder"
      >
        <HugeiconsIcon icon={FolderAddIcon} size={16} />
      </button>

      <div class="dropdown dropdown-end ml-1" style="--wails-draggable: no-drag">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          tabindex="0"
          role="button"
          class="btn btn-primary btn-xs gap-1 h-7 min-h-0 px-3 text-xs font-medium"
          class:opacity-50={!appState.currentBucket || uploading}
          class:pointer-events-none={!appState.currentBucket || uploading}
        >
          {#if uploading}
            <span class="loading loading-spinner loading-xs"></span>
          {:else}
            <HugeiconsIcon icon={Upload01Icon} size={15} />
          {/if}
          Upload
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <ul tabindex="-1" class="dropdown-content menu bg-base-200 border border-base-300 rounded-box shadow-lg z-50 w-44 p-1 mt-1">
          <li>
            <button class="text-sm flex items-center gap-2" onclick={handleUpload}>
              <HugeiconsIcon icon={Upload01Icon} size={14} />
              Upload files
            </button>
          </li>
          <li>
            <button class="text-sm flex items-center gap-2" onclick={handleUploadFolder}>
              <HugeiconsIcon icon={FolderAddIcon} size={14} />
              Upload folder
            </button>
          </li>
        </ul>
      </div>

      <button
        class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content ml-1"
        onclick={() => { appState.showSettings = true; }}
        title="Settings"
      >
        <HugeiconsIcon icon={Settings01Icon} size={16} />
      </button>
    </div>

</div>
