<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import { Link03Icon, Tick01Icon, Refresh01Icon } from '@hugeicons/core-free-icons';
  import { GetPresignedURL } from '$lib/wailsjs/go/main/App';
  import { appState } from '$lib/stores/appState.svelte';

  const expiryOptions = [
    { label: '15 minutes', value: 900 },
    { label: '1 hour', value: 3600 },
    { label: '6 hours', value: 21600 },
    { label: '24 hours', value: 86400 },
    { label: '7 days', value: 604800 },
  ];

  let expiry = $state(3600);
  let url = $state('');
  let loading = $state(false);
  let copied = $state(false);
  let error = $state('');

  async function generate() {
    if (!appState.presignedUrlTarget) return;
    loading = true;
    error = '';
    url = '';
    try {
      url = await GetPresignedURL(
        appState.presignedUrlTarget.bucket,
        appState.presignedUrlTarget.key,
        expiry,
      );
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  async function copyUrl() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }

  function close() {
    appState.showPresignedUrl = false;
    appState.presignedUrlTarget = null;
    url = '';
    error = '';
  }

  // Auto-generate on open
  $effect(() => {
    if (appState.presignedUrlTarget) void generate();
  });
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-50 flex items-center justify-center" onclick={close}>
  <div class="absolute inset-0 bg-black/60"></div>

  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <!-- Modal -->
  <div
    class="relative bg-base-200 border border-base-300 w-full max-w-lg shadow-2xl"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-base-300">
      <div class="flex items-center gap-2">
        <HugeiconsIcon icon={Link03Icon} size={15} class="text-primary" />
        <h3 class="text-sm font-semibold">Presigned URL</h3>
      </div>
      <button class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/40" onclick={close}>✕</button>
    </div>

    <div class="p-4 flex flex-col gap-4">
      {#if appState.presignedUrlTarget}
        <p class="text-xs font-mono text-base-content/40 truncate" title={appState.presignedUrlTarget.key}>
          {appState.presignedUrlTarget.name}
        </p>
      {/if}

      <!-- Expiry selector -->
      <div class="flex items-center gap-3">
        <label for="presigned-expiry" class="text-xs text-base-content/40 whitespace-nowrap">Expires in</label>
        <select
          id="presigned-expiry"
          class="select select-bordered select-xs bg-base-100 flex-1"
          bind:value={expiry}
          onchange={generate}
        >
          {#each expiryOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
        <button class="btn btn-ghost btn-xs p-1 h-auto min-h-0" onclick={generate} title="Regenerate">
          <HugeiconsIcon icon={Refresh01Icon} size={13} />
        </button>
      </div>

      <!-- URL output -->
      {#if loading}
        <div class="flex justify-center py-4">
          <span class="loading loading-spinner loading-sm text-primary"></span>
        </div>
      {:else if error}
        <div class="bg-error/10 border border-error/20 text-error text-xs p-3">{error}</div>
      {:else if url}
        <div class="bg-base-100 border border-base-300 p-3 max-h-32 overflow-y-auto">
          <p class="text-xs font-mono break-all text-base-content/60 leading-relaxed">{url}</p>
        </div>
        <button
          class="btn w-full gap-2"
          class:btn-success={copied}
          class:btn-primary={!copied}
          onclick={copyUrl}
        >
          {#if copied}
            <HugeiconsIcon icon={Tick01Icon} size={14} />
            Copied to clipboard!
          {:else}
            <HugeiconsIcon icon={Link03Icon} size={14} />
            Copy to Clipboard
          {/if}
        </button>
      {/if}
    </div>
  </div>
</div>
