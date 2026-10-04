<script lang="ts">
  import { onMount } from 'svelte';
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import { BucketIcon, Refresh01Icon, Download01Icon, Tick01Icon, Alert02Icon } from '@hugeicons/core-free-icons';
  import { GetVersion, GetAvailableUpdate, CheckForUpdates } from '$bindings/oso/app';

  type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'error';
  let appVersion = $state('');
  let updateVersion = $state('');
  let updateStatus = $state<UpdateStatus>('idle');
  let updateError = $state('');

  onMount(() => {
    GetVersion()
      .then((v) => { appVersion = v; })
      .catch(() => {});
  });

  async function checkForUpdate() {
    updateStatus = 'checking';
    updateError = '';
    try {
      updateVersion = await GetAvailableUpdate();
      updateStatus = updateVersion ? 'available' : 'latest';
    } catch (e) {
      updateError = String(e);
      updateStatus = 'error';
    }
  }

  function installUpdate() {
    // Opens the built-in update window, which handles download and install
    CheckForUpdates();
  }
</script>

<div class="flex-1 overflow-y-auto px-5 py-5">
  <div class="flex flex-col gap-5 max-w-xl">
    <section class="flex items-center gap-4">
      <div class="text-primary">
        <HugeiconsIcon icon={BucketIcon} size={40} />
      </div>
      <div>
        <h2 class="text-xl font-bold tracking-tight">oso</h2>
        <p class="text-sm text-base-content/40 mt-0.5">Object Storage Operator</p>
      </div>
    </section>

    <!-- Updates -->
    <section class="border-t border-base-300 pt-4">
      <p class="text-xs font-bold uppercase tracking-widest text-base-content/30 mb-3">Updates</p>
      <div class="flex items-center justify-between gap-3">
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-sm">Current version {appVersion ? `v${appVersion}` : '—'}</span>
          {#if updateStatus === 'latest'}
            <span class="flex items-center gap-1.5 text-xs text-success">
              <HugeiconsIcon icon={Tick01Icon} size={13} />
              You're up to date
            </span>
          {:else if updateStatus === 'available'}
            <span class="text-xs text-primary">Version v{updateVersion} is available</span>
          {:else if updateStatus === 'error'}
            <span class="flex items-start gap-1.5 text-xs text-error">
              <HugeiconsIcon icon={Alert02Icon} size={13} class="shrink-0 mt-0.5" />
              <span class="wrap-break-word min-w-0">{updateError}</span>
            </span>
          {/if}
        </div>
        {#if updateStatus === 'available'}
          <button class="btn btn-primary btn-sm gap-2 shrink-0" onclick={installUpdate}>
            <HugeiconsIcon icon={Download01Icon} size={14} />
            Update to v{updateVersion}
          </button>
        {:else}
          <button
            class="btn btn-outline btn-sm gap-2 shrink-0"
            onclick={checkForUpdate}
            disabled={updateStatus === 'checking'}
          >
            {#if updateStatus === 'checking'}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <HugeiconsIcon icon={Refresh01Icon} size={14} />
            {/if}
            Check for updates
          </button>
        {/if}
      </div>
    </section>

    <section class="border-t border-base-300 pt-4">
      <p class="text-xs font-bold uppercase tracking-widest text-base-content/30 mb-3">Files</p>
      <p class="text-xs text-base-content/40 leading-relaxed">
        Connections are saved to <span class="font-mono">~/.oso/profiles.json</span> and settings to
        <span class="font-mono">~/.oso/settings.json</span>.
      </p>
    </section>
  </div>
</div>
