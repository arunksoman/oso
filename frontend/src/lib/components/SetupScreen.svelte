<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import { BucketIcon, WifiError02Icon, CloudServerIcon } from '@hugeicons/core-free-icons';
  import { Connect, GetActiveProfileID, SwitchProfile } from '$bindings/oso/app';
  import { appState } from '$lib/stores/appState.svelte';
  import type { ConnectionProfile } from '$lib/stores/appState.svelte';
  import TitleBar from './TitleBar.svelte';

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
      // Connect saved the account as a profile and made it the active one
      appState.applyConnection((await GetActiveProfileID()) ?? '', true);
    } catch (e) {
      error = String(e);
    } finally {
      connecting = false;
    }
  }

  let switchingId = $state('');

  async function useProfile(profile: ConnectionProfile) {
    switchingId = profile.id;
    error = null;
    try {
      await SwitchProfile(profile.id);
      appState.applyConnection(profile.id, true);
    } catch (e) {
      error = String(e);
    } finally {
      switchingId = '';
    }
  }
</script>

<div class="h-screen flex flex-col bg-base-100">
  <TitleBar />

  <div class="flex-1 flex items-center justify-center">
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

    <!-- Saved connections -->
    {#if appState.profiles.length > 0}
      <div class="px-8 pt-5 flex flex-col gap-2">
        <p class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Saved connections</p>
        <ul class="flex flex-col border border-base-300 divide-y divide-base-300 max-h-40 overflow-y-auto">
          {#each appState.profiles as profile (profile.id)}
            <li>
              <button
                type="button"
                class="flex items-center gap-2.5 w-full px-3 py-2 text-left bg-base-100 hover:bg-base-300 transition-colors"
                onclick={() => useProfile(profile)}
                disabled={switchingId !== '' || connecting}
              >
                <span class="shrink-0 text-primary">
                  {#if switchingId === profile.id}
                    <span class="loading loading-spinner loading-xs"></span>
                  {:else}
                    <HugeiconsIcon icon={CloudServerIcon} size={16} />
                  {/if}
                </span>
                <span class="flex-1 min-w-0">
                  <span class="block text-sm font-medium truncate">{profile.name}</span>
                  <span class="block text-xs font-mono text-base-content/40 truncate">{profile.endpoint}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
        <p class="text-xs text-base-content/30 text-center pt-2">or connect to another account</p>
      </div>
    {/if}

    <!-- Form -->
    <form class="px-8 {appState.profiles.length > 0 ? 'pt-3 pb-6' : 'py-6'} flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); handleConnect(); }}>
      <div class="flex flex-col gap-1">
        <label for="setup-endpoint" class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Endpoint URL</label>
        <input
          id="setup-endpoint"
          type="url"
          class="input input-bordered input-sm bg-base-100 w-full font-mono text-sm"
          placeholder="https://s3.amazonaws.com"
          bind:value={endpoint}
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label for="setup-access-key" class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Access Key</label>
          <input
            id="setup-access-key"
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
          <label for="setup-secret-key" class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Secret Key</label>
          <input
            id="setup-secret-key"
            type="password"
            class="input input-bordered input-sm bg-base-100 w-full font-mono text-xs"
            placeholder="••••••••"
            bind:value={secretKey}
            autocomplete="off"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label for="setup-region" class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Region</label>
        <input
          id="setup-region"
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
        type="submit"
        class="btn btn-primary w-full mt-1"
        disabled={connecting || switchingId !== ''}
      >
        {#if connecting}
          <span class="loading loading-spinner loading-sm"></span>
          Connecting…
        {:else}
          Connect
        {/if}
      </button>
    </form>

    <div class="px-8 pb-6 text-center text-xs text-base-content/25">
      Credentials saved to <span class="font-mono">~/.oso/profiles.json</span>
    </div>
  </div>
  </div>
</div>
