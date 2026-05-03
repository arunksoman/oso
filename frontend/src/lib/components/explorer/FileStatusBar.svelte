<script lang="ts">
  import { appState } from '$lib/stores/appState.svelte';
  import type { S3Object } from '$lib/stores/appState.svelte';

  let {
    filteredObjects,
    searchBusy,
    searchResults,
    onloadmore,
  }: {
    filteredObjects: S3Object[];
    searchBusy: boolean;
    searchResults: S3Object[] | null;
    onloadmore: () => void;
  } = $props();
</script>

<div class="py-2 flex justify-center border-t border-base-300 shrink-0 min-h-8">
  {#if appState.isLoading}
    <span class="loading loading-spinner loading-xs text-primary/40"></span>
  {:else if searchBusy}
    <span class="loading loading-spinner loading-xs text-base-content/40"></span>
  {:else if appState.searchQuery.trim() && searchResults !== null}
    <span class="text-xs text-base-content/30">{filteredObjects.length} match(es)</span>
  {:else if appState.hasMore}
    <button class="btn btn-ghost btn-xs text-base-content/30" onclick={onloadmore}>
      Load more
    </button>
  {:else if filteredObjects.length > 0}
    <span class="text-xs text-base-content/15">{filteredObjects.length} items</span>
  {/if}
</div>
