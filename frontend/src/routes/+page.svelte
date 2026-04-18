<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Copy01Icon, Cancel01Icon, Tick01Icon, Alert02Icon, InformationCircleIcon } from '@hugeicons/core-free-icons';
  import { IsConnected, GetSettings } from '$lib/wailsjs/go/main/App';
  import { EventsOn } from '$lib/wailsjs/runtime/runtime';
  import { appState } from '$lib/stores/appState.svelte';
  import SetupScreen from '$lib/components/SetupScreen.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TitleBar from '$lib/components/TitleBar.svelte';
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
      <TitleBar />
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
    {@const t = appState.notification.type}
    <div class="fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-2">
      <div class="flex items-stretch rounded-box shadow-2xl overflow-hidden border border-base-300 bg-base-100">
        <!-- Color accent bar -->
        <div
          class="w-1.5 shrink-0"
          class:bg-success={t === 'success'}
          class:bg-error={t === 'error'}
          class:bg-warning={t === 'warning'}
          class:bg-info={t === 'info'}
        ></div>
        <!-- Icon -->
        <div class="flex items-center px-3">
          {#if t === 'success'}
            <span class="text-success"><HugeiconsIcon icon={Tick01Icon} size={18} /></span>
          {:else if t === 'error'}
            <span class="text-error"><HugeiconsIcon icon={Alert02Icon} size={18} /></span>
          {:else if t === 'warning'}
            <span class="text-warning"><HugeiconsIcon icon={Alert02Icon} size={18} /></span>
          {:else}
            <span class="text-info"><HugeiconsIcon icon={InformationCircleIcon} size={18} /></span>
          {/if}
        </div>
        <!-- Message -->
        <div class="flex-1 py-2.5 pr-1 text-sm text-base-content select-text wrap-break-word">
          {appState.notification.message}
        </div>
        <!-- Action buttons -->
        <div class="flex items-center gap-0.5 px-1.5 shrink-0">
          <button
            class="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0 p-0 text-base-content/40 hover:text-base-content/70"
            title="Copy to clipboard"
            onclick={() => { navigator.clipboard.writeText(appState.notification?.message ?? ''); }}
          >
            <HugeiconsIcon icon={Copy01Icon} size={13} />
          </button>
          <button
            class="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0 p-0 text-base-content/40 hover:text-base-content/70"
            title="Dismiss"
            onclick={() => { appState.notification = null; }}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} />
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}
