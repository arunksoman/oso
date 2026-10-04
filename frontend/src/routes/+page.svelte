<script lang="ts">
  import { onMount } from 'svelte';
  import { Events } from '@wailsio/runtime';
  import { appState } from '$lib/stores/appState.svelte';
  import { listenForSharedState, loadSharedState } from '$lib/stores/sync';
  import SetupScreen from '$lib/components/SetupScreen.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TitleBar from '$lib/components/TitleBar.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import FileExplorer from '$lib/components/FileExplorer.svelte';
  import ObjectPropertiesPanel from '$lib/components/ObjectPropertiesPanel.svelte';
  import DeleteBucketModal from '$lib/components/DeleteBucketModal.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import PresignedUrlModal from '$lib/components/PresignedUrlModal.svelte';
  import DeleteConfirmModal from '$lib/components/DeleteConfirmModal.svelte';
  import UploadProgressPanel from '$lib/components/UploadProgressPanel.svelte';

  let checking = $state(true);

  onMount(async () => {
    // Settings and connection changes made in the settings window
    listenForSharedState();

    try {
      await loadSharedState();
    } catch (e) {
      console.error('Startup error:', e);
    } finally {
      checking = false;
    }

    // Upload event listeners
    Events.On('upload:folder:start', ({ data }) => {
      appState.uploadBatch = { total: data.total, done: 0, errors: 0 };
    });

    Events.On('upload:progress', ({ data }) => {
      // In batch mode the batch bar handles progress — skip individual entries
      if (appState.uploadBatch) return;
      appState.uploads = {
        ...appState.uploads,
        [data.key]: { key: data.key, progress: data.progress, done: false },
      };
    });

    Events.On('upload:done', ({ data }) => {
      if (appState.uploadBatch) {
        const next = { ...appState.uploadBatch, done: appState.uploadBatch.done + 1 };
        appState.uploadBatch = next;
        if (next.done + next.errors >= next.total) {
          // All files finished — refresh listing, hold for 2s then clear
          appState.refreshTrigger = Date.now();
          setTimeout(() => {
            appState.uploadBatch = null;
          }, 2000);
        }
        return;
      }
      // Single file mode
      appState.uploads = {
        ...appState.uploads,
        [data.key]: { key: data.key, progress: 100, done: true },
      };
      setTimeout(() => {
        const u = { ...appState.uploads };
        delete u[data.key];
        appState.uploads = u;
      }, 4000);
    });

    Events.On('upload:error', ({ data }) => {
      if (appState.uploadBatch) {
        const next = { ...appState.uploadBatch, errors: appState.uploadBatch.errors + 1 };
        appState.uploadBatch = next;
        if (next.done + next.errors >= next.total) {
          appState.refreshTrigger = Date.now();
          setTimeout(() => {
            appState.uploadBatch = null;
          }, 2000);
        }
        return;
      }
      // Single file mode — show error entry in panel
      appState.uploads = {
        ...appState.uploads,
        [data.key]: { key: data.key, progress: 0, done: false, error: data.error },
      };
    });
  });
</script>

{#if checking}
  <!-- Loading splash -->
  <div class="h-screen w-screen flex items-center justify-center bg-base-100">
    <span class="loading loading-spinner loading-md text-primary/40"></span>
  </div>
{:else if !appState.connected}
  <SetupScreen />
{:else}
  <!-- Main app shell -->
  <div class="flex h-screen w-screen overflow-hidden bg-base-100 text-base-content">
    <Sidebar />
    <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
      <TitleBar />
      <Toolbar />
      <div class="flex flex-1 min-h-0 overflow-hidden">
        <FileExplorer />
        <ObjectPropertiesPanel />
      </div>
    </div>
  </div>

  <!-- Modals (rendered as fixed overlays) -->
  {#if appState.deleteBucketTarget}
    <DeleteBucketModal />
  {/if}
  {#if appState.showPresignedUrl}
    <PresignedUrlModal />
  {/if}
  {#if appState.showDeleteConfirm}
    <DeleteConfirmModal />
  {/if}

  <!-- Floating upload progress -->
  <UploadProgressPanel />

{/if}

<Toast />
