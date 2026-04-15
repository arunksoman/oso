<script lang="ts">
  import { onMount } from 'svelte';
  import { IsConnected, GetSettings } from '$lib/wailsjs/go/main/App';
  import { EventsOn } from '$lib/wailsjs/runtime/runtime';
  import { appState } from '$lib/stores/appState.svelte';
  import SetupScreen from '$lib/components/SetupScreen.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import FileExplorer from '$lib/components/FileExplorer.svelte';
  import SettingsModal from '$lib/components/SettingsModal.svelte';
  import PresignedUrlModal from '$lib/components/PresignedUrlModal.svelte';
  import DeleteConfirmModal from '$lib/components/DeleteConfirmModal.svelte';
  import UploadProgressPanel from '$lib/components/UploadProgressPanel.svelte';

  let checking = $state(true);

  onMount(async () => {
    try {
      const connected = await IsConnected();
      appState.connected = connected;
      if (connected) {
        const s = await GetSettings();
        appState.settings = s;
      }
    } catch (e) {
      console.error('Startup error:', e);
    } finally {
      checking = false;
    }

    // Upload event listeners
    EventsOn('upload:progress', (data: { key: string; progress: number }) => {
      appState.uploads = {
        ...appState.uploads,
        [data.key]: { key: data.key, progress: data.progress, done: false },
      };
    });

    EventsOn('upload:done', (data: { key: string }) => {
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

    EventsOn('upload:error', (data: { key: string; error: string }) => {
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
      <Toolbar />
      <FileExplorer />
    </div>
  </div>

  <!-- Modals (rendered as fixed overlays) -->
  {#if appState.showSettings}
    <SettingsModal />
  {/if}
  {#if appState.showPresignedUrl}
    <PresignedUrlModal />
  {/if}
  {#if appState.showDeleteConfirm}
    <DeleteConfirmModal />
  {/if}

  <!-- Floating upload progress -->
  <UploadProgressPanel />

  <!-- Toast notification -->
  {#if appState.notification}
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div
        class="px-4 py-2.5 text-sm font-medium shadow-2xl border"
        class:bg-success={appState.notification.type === 'success'}
        class:text-success-content={appState.notification.type === 'success'}
        class:border-success={appState.notification.type === 'success'}
        class:bg-error={appState.notification.type === 'error'}
        class:text-error-content={appState.notification.type === 'error'}
        class:border-error={appState.notification.type === 'error'}
        class:bg-base-200={appState.notification.type === 'info'}
        class:text-base-content={appState.notification.type === 'info'}
        class:border-base-300={appState.notification.type === 'info'}
      >
        {appState.notification.message}
      </div>
    </div>
  {/if}
{/if}
