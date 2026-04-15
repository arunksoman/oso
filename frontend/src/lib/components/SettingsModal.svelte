<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Settings01Icon, WifiError02Icon } from '@hugeicons/core-free-icons';
  import {
    SaveSettings,
    GetSavedConfig,
    Connect,
    Disconnect,
    OpenDirectoryDialog,
  } from '$lib/wailsjs/go/main/App';
  import { appState } from '$lib/stores/appState.svelte';
  import type { AppSettings, S3Config } from '$lib/stores/appState.svelte';

  type Tab = 'general' | 'connection';
  let activeTab = $state<Tab>('general');

  let settings = $state<AppSettings>({ ...appState.settings });
  let saving = $state(false);

  let config = $state<S3Config>({ endpoint: '', accessKey: '', secretKey: '', region: 'us-east-1' });
  let reconnecting = $state(false);
  let connError = $state('');

  async function init() {
    settings = { ...appState.settings };
    try {
      const saved = await GetSavedConfig();
      if (saved) config = { ...saved };
    } catch {}
  }

  $effect(() => {
    if (appState.showSettings) void init();
  });

  async function saveSettings() {
    saving = true;
    try {
      await SaveSettings(settings);
      appState.settings = { ...settings };
      appState.notify('Settings saved', 'success');
      close();
    } catch (e) {
      appState.notify(`Save failed: ${e}`, 'error');
    } finally {
      saving = false;
    }
  }

  async function browse() {
    const path = await OpenDirectoryDialog();
    if (path) settings.defaultDownloadPath = path;
  }

  async function reconnect() {
    connError = '';
    reconnecting = true;
    try {
      await Connect(config);
      appState.notify('Reconnected successfully', 'success');
    } catch (e) {
      connError = String(e);
    } finally {
      reconnecting = false;
    }
  }

  function disconnect() {
    Disconnect();
    appState.connected = false;
    appState.currentBucket = null;
    appState.buckets = [];
    appState.objects = [];
    close();
  }

  function close() {
    appState.showSettings = false;
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center">
  <div class="absolute inset-0 bg-black/60" onclick={close}></div>

  <div
    class="relative bg-base-200 border border-base-300 w-full max-w-lg shadow-2xl"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-base-300">
      <div class="flex items-center gap-2">
        <HugeiconsIcon icon={Settings01Icon} size={15} class="text-primary" />
        <h3 class="text-sm font-semibold">Settings</h3>
      </div>
      <button class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/40" onclick={close}>✕</button>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-base-300">
      <button
        class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors {activeTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-base-content/40'}"
        onclick={() => { activeTab = 'general'; }}
      >General</button>
      <button
        class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors {activeTab === 'connection' ? 'border-primary text-primary' : 'border-transparent text-base-content/40'}"
        onclick={() => { activeTab = 'connection'; }}
      >Connection</button>
    </div>

    <div class="p-5">
      {#if activeTab === 'general'}
        <div class="flex flex-col gap-5">
          <!-- Downloads -->
          <div>
            <p class="text-xs font-bold uppercase tracking-widest text-base-content/30 mb-3">Downloads</p>
            <div class="flex gap-2 mb-3">
              <input
                type="text"
                class="input input-bordered input-sm bg-base-100 flex-1 font-mono text-xs"
                placeholder="Default download folder"
                bind:value={settings.defaultDownloadPath}
              />
              <button class="btn btn-outline btn-sm" onclick={browse}>Browse</button>
            </div>
            <label class="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" bind:checked={settings.askBeforeDownload} />
              <span class="text-sm">Ask for save location before each download</span>
            </label>
          </div>

          <!-- Display -->
          <div class="border-t border-base-300 pt-4">
            <p class="text-xs font-bold uppercase tracking-widest text-base-content/30 mb-3">Display</p>
            <label class="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" bind:checked={settings.showFileDetails} />
              <span class="text-sm">Show file details (size, type, modified)</span>
            </label>
          </div>

          <div class="flex justify-end gap-2 pt-1 border-t border-base-300">
            <button class="btn btn-ghost btn-sm" onclick={close}>Cancel</button>
            <button class="btn btn-primary btn-sm gap-2" onclick={saveSettings} disabled={saving}>
              {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
              Save
            </button>
          </div>
        </div>

      {:else}
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-bold uppercase tracking-widest text-base-content/30">Endpoint URL</label>
            <input type="url" class="input input-bordered input-sm bg-base-100 font-mono" bind:value={config.endpoint} />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold uppercase tracking-widest text-base-content/30">Access Key</label>
              <input type="text" class="input input-bordered input-sm bg-base-100 font-mono text-xs" autocomplete="off" bind:value={config.accessKey} />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold uppercase tracking-widest text-base-content/30">Secret Key</label>
              <input type="password" class="input input-bordered input-sm bg-base-100 font-mono text-xs" autocomplete="off" bind:value={config.secretKey} />
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-bold uppercase tracking-widest text-base-content/30">Region</label>
            <input type="text" class="input input-bordered input-sm bg-base-100" bind:value={config.region} />
          </div>

          {#if connError}
            <div class="flex items-start gap-2 bg-error/10 border border-error/20 text-error p-3 text-xs">
              <HugeiconsIcon icon={WifiError02Icon} size={14} class="shrink-0 mt-0.5" />
              <span>{connError}</span>
            </div>
          {/if}

          <div class="flex justify-between pt-1 border-t border-base-300">
            <button class="btn btn-error btn-sm btn-outline gap-2" onclick={disconnect}>
              Disconnect
            </button>
            <button class="btn btn-primary btn-sm gap-2" onclick={reconnect} disabled={reconnecting}>
              {#if reconnecting}<span class="loading loading-spinner loading-xs"></span>{/if}
              Reconnect
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
