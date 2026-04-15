<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    ArrowLeft02Icon,
    ArrowUp02Icon,
    Refresh01Icon,
    Upload01Icon,
    FolderAddIcon,
    Settings01Icon,
    Search01Icon,
  } from '@hugeicons/core-free-icons';
  import { OpenMultipleFilesDialog, UploadFiles } from '$lib/wailsjs/go/main/App';
  import { appState } from '$lib/stores/appState.svelte';
  import Breadcrumb from './Breadcrumb.svelte';

  let uploading = $state(false);

  async function handleUpload() {
    if (!appState.currentBucket) {
      appState.notify('Select a bucket first', 'error');
      return;
    }
    try {
      const files = await OpenMultipleFilesDialog();
      if (!files || files.length === 0) return;
      uploading = true;
      await UploadFiles(appState.currentBucket, appState.currentPrefix, files);
      appState.notify(`Uploaded ${files.length} file(s)`, 'success');
      appState.refreshTrigger = Date.now();
    } catch (e) {
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
  <!-- Nav buttons -->
  <button
    class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
    onclick={goBack}
    disabled={!canGoUp}
    title="Back / Parent folder"
  >
    <HugeiconsIcon icon={ArrowLeft02Icon} size={14} />
  </button>
  <button
    class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
    onclick={goUp}
    disabled={!canGoUp}
    title="Go to parent folder"
  >
    <HugeiconsIcon icon={ArrowUp02Icon} size={14} />
  </button>

  <!-- Divider -->
  <span class="w-px h-4 bg-base-300 mx-0.5"></span>

  <!-- Breadcrumb -->
  <div class="flex-1 min-w-0">
    <Breadcrumb />
  </div>

  <!-- Search -->
  {#if appState.currentBucket}
    <label class="input input-xs input-ghost bg-base-300/50 h-6 min-h-0 w-40 focus-within:w-56 transition-all gap-1.5">
      <HugeiconsIcon icon={Search01Icon} size={12} />
      <input
        type="text"
        class="grow text-xs"
        placeholder="Filter..."
        bind:value={appState.searchQuery}
      />
      {#if appState.searchQuery}
        <button class="text-base-content/40 hover:text-base-content/70 text-xs" onclick={() => { appState.searchQuery = ''; }}>✕</button>
      {/if}
    </label>
  {/if}

  <!-- Divider -->
  <span class="w-px h-4 bg-base-300 mx-0.5"></span>

  <!-- Action buttons -->
  <div class="flex items-center gap-0.5">
    <button
      class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
      onclick={() => { appState.refreshTrigger = Date.now(); }}
      title="Refresh"
    >
      <HugeiconsIcon icon={Refresh01Icon} size={14} />
    </button>

    <button
      class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
      onclick={() => { appState.showNewFolder = true; }}
      disabled={!appState.currentBucket}
      title="New folder"
    >
      <HugeiconsIcon icon={FolderAddIcon} size={14} />
    </button>

    <button
      class="btn btn-primary btn-xs gap-1 h-7 min-h-0 px-3 ml-1 text-xs font-medium"
      onclick={handleUpload}
      disabled={!appState.currentBucket || uploading}
      title="Upload files"
    >
      {#if uploading}
        <span class="loading loading-spinner loading-xs"></span>
      {:else}
        <HugeiconsIcon icon={Upload01Icon} size={13} />
      {/if}
      Upload
    </button>

    <button
      class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content ml-1"
      onclick={() => { appState.showSettings = true; }}
      title="Settings"
    >
      <HugeiconsIcon icon={Settings01Icon} size={14} />
    </button>
  </div>
</div>
