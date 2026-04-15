<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { BucketIcon, WifiError02Icon } from '@hugeicons/core-free-icons';
  import { Connect } from '$lib/wailsjs/go/main/App';
  import { appState } from '$lib/stores/appState.svelte';

  let endpoint = $state('');
  let accessKey = $state('');
  let secretKey = $state('');
  let region = $state('us-east-1');
  let connecting = $state(false);
  let error = $state<string | null>(null);

  async function handleConnect() {
    if (!endpoint.trim() || !accessKey.trim() || !secretKey.trim()) {
      error = 'Endpoint, Access Key and Secret Key are required';
      return;
    }
    connecting = true;
    error = null;
    try {
      await Connect({ endpoint: endpoint.trim(), accessKey: accessKey.trim(), secretKey: secretKey.trim(), region: region.trim() || 'us-east-1' });
      appState.connected = true;
    } catch (e) {
      error = String(e);
    } finally {
      connecting = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleConnect();
  }
</script>

<div class="h-screen flex items-center justify-center bg-base-100">
  <div class="w-full max-w-md bg-base-200 border border-base-300">
    <!-- Header -->
    <div class="flex flex-col items-center gap-3 px-8 pt-8 pb-6 border-b border-base-300">
      <div class="text-primary">
        <HugeiconsIcon icon={BucketIcon} size={40} />
      </div>
      <div class="text-center">
        <h1 class="text-xl font-bold tracking-tight">oso</h1>
        <p class="text-sm text-base-content/40 mt-0.5">Object Storage Operator</p>
      </div>
    </div>

    <!-- Form -->
    <div class="px-8 py-6 flex flex-col gap-4" onkeydown={handleKeyDown}>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Endpoint URL</label>
        <input
          type="url"
          class="input input-bordered input-sm bg-base-100 w-full font-mono text-sm"
          placeholder="https://s3.amazonaws.com"
          bind:value={endpoint}
          autofocus
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Access Key</label>
          <input
            type="text"
            class="input input-bordered input-sm bg-base-100 w-full font-mono text-xs"
            placeholder="AKIAIOSFODNN7"
            bind:value={accessKey}
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Secret Key</label>
          <input
            type="password"
            class="input input-bordered input-sm bg-base-100 w-full font-mono text-xs"
            placeholder="••••••••"
            bind:value={secretKey}
            autocomplete="off"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Region</label>
        <input
          type="text"
          class="input input-bordered input-sm bg-base-100 w-full"
          placeholder="us-east-1"
          bind:value={region}
        />
      </div>

      {#if error}
        <div class="flex items-start gap-2 bg-error/10 border border-error/20 text-error p-3 text-sm">
          <HugeiconsIcon icon={WifiError02Icon} size={16} class="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      {/if}

      <button
        class="btn btn-primary w-full mt-1"
        onclick={handleConnect}
        disabled={connecting}
      >
        {#if connecting}
          <span class="loading loading-spinner loading-sm"></span>
          Connecting…
        {:else}
          Connect
        {/if}
      </button>
    </div>

    <div class="px-8 pb-6 text-center text-xs text-base-content/25">
      Credentials saved to <span class="font-mono">~/.oso/config.json</span>
    </div>
  </div>
</div>
