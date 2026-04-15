<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { BucketIcon, Refresh01Icon } from '@hugeicons/core-free-icons';
  import { ListBuckets, GetVersion } from '$lib/wailsjs/go/main/App';
  import { appState } from '$lib/stores/appState.svelte';
  import type { Bucket } from '$lib/stores/appState.svelte';

  let appVersion = $state('');

  async function loadBuckets() {
    appState.bucketsLoading = true;
    try {
      const buckets = await ListBuckets();
      appState.buckets = buckets ?? [];
    } catch (e) {
      appState.notify(`Failed to load buckets: ${e}`, 'error');
    } finally {
      appState.bucketsLoading = false;
    }
  }

  function selectBucket(bucket: Bucket) {
    if (appState.currentBucket === bucket.name) return;
    appState.currentBucket = bucket.name;
    appState.currentPrefix = '';
    appState.objects = [];
    appState.continuationToken = '';
    appState.hasMore = false;
    appState.selectedKeys = new Set();
  }

  onMount(() => {
    loadBuckets();
    GetVersion().then((v) => { appVersion = v; });
  });
</script>

<aside class="w-56 bg-base-200 flex flex-col shrink-0 border-r border-base-300 overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between px-3 py-2.5 border-b border-base-300">
    <div class="flex items-center gap-2 text-base-content/50">
      <HugeiconsIcon icon={BucketIcon} size={13} />
      <span class="text-xs font-bold uppercase tracking-widest">Buckets</span>
    </div>
    <button
      class="btn btn-ghost btn-xs p-0.5 h-auto min-h-0"
      onclick={loadBuckets}
      disabled={appState.bucketsLoading}
      title="Refresh bucket list"
    >
      <span class={appState.bucketsLoading ? 'animate-spin' : ''}>
        <HugeiconsIcon icon={Refresh01Icon} size={13} />
      </span>
    </button>
  </div>

  <!-- Bucket list -->
  <div class="flex-1 overflow-y-auto py-1">
    {#if appState.bucketsLoading && appState.buckets.length === 0}
      <div class="flex justify-center py-8">
        <span class="loading loading-spinner loading-xs text-primary"></span>
      </div>
    {:else if appState.buckets.length === 0}
      <p class="text-xs text-base-content/30 text-center py-6 px-4">No buckets found</p>
    {:else}
      {#each appState.buckets as bucket (bucket.name)}
        <button
          class="flex items-center gap-2.5 w-full px-3 py-1.5 text-left transition-colors group"
          class:bg-primary={appState.currentBucket === bucket.name}
          class:text-primary-content={appState.currentBucket === bucket.name}
          class:hover:bg-base-300={appState.currentBucket !== bucket.name}
          onclick={() => selectBucket(bucket)}
        >
          <span class={appState.currentBucket === bucket.name ? 'text-primary-content/70' : 'text-warning/60 group-hover:text-warning/80'}>
            <HugeiconsIcon icon={BucketIcon} size={14} />
          </span>
          <span class="text-xs font-medium truncate">{bucket.name}</span>
        </button>
      {/each}
    {/if}
  </div>

  <!-- Footer -->
  <div class="px-3 py-2 border-t border-base-300 flex flex-col items-center gap-1">
    {#if appState.currentBucket}
      <p class="text-xs font-mono text-base-content/25 truncate w-full text-center" title="s3://{appState.currentBucket}">
        s3://{appState.currentBucket}
      </p>
    {/if}
    {#if appVersion}
      <p class="text-xs text-base-content/40">v{appVersion}</p>
    {/if}
  </div>
</aside>
