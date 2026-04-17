<script lang="ts">
  import { appState } from '$lib/stores/appState.svelte';

  interface Crumb {
    name: string;
    prefix: string;
  }

  const crumbs = $derived.by((): Crumb[] => {
    if (!appState.currentBucket) return [];
    const parts: Crumb[] = [{ name: appState.currentBucket, prefix: '' }];
    if (appState.currentPrefix) {
      const segments = appState.currentPrefix.split('/').filter(Boolean);
      let cumulative = '';
      for (const seg of segments) {
        cumulative += seg + '/';
        parts.push({ name: seg, prefix: cumulative });
      }
    }
    return parts;
  });

  function navigate(crumb: Crumb) {
    if (appState.currentPrefix === crumb.prefix) return;
    appState.currentPrefix = crumb.prefix;
    appState.objects = [];
    appState.continuationToken = '';
    appState.selectedKeys = new Set();
  }  // Show all crumbs if 3 or fewer, otherwise show first (bucket), ellipsis, and last 2
  const visibleCrumbs = $derived.by(() => {
    if (crumbs.length <= 3) return crumbs;
    return [crumbs[0], null, crumbs[crumbs.length - 2], crumbs[crumbs.length - 1]];
  });
</script>

<div class="flex items-center min-w-0 overflow-hidden">
  {#if crumbs.length === 0}
    <span class="text-xs text-base-content/25 italic">No bucket selected</span>
  {:else}
    {#each visibleCrumbs as crumb, i (crumb ? crumb.prefix + i : 'ellipsis')}
      {#if i > 0}
        <span class="text-base-content/20 px-1 text-xs select-none shrink-0">/</span>
      {/if}
      {#if crumb === null}
        <span class="text-base-content/25 text-xs px-1 shrink-0 select-none">…</span>
      {:else}
        <button
          class="text-xs font-mono px-1 py-0.5 shrink-0 max-w-32 truncate transition-colors hover:text-primary {crumb === visibleCrumbs[visibleCrumbs.length - 1] ? 'text-primary font-semibold' : 'text-base-content/50'}"
          onclick={() => navigate(crumb)}
          title={crumb.prefix || crumb.name}
        >
          {crumb.name}
        </button>
      {/if}
    {/each}
  {/if}
</div>
