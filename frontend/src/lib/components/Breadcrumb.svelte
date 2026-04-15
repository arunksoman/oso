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
  }
</script>

<div class="flex items-center overflow-x-auto scrollbar-none min-w-0">
  {#if crumbs.length === 0}
    <span class="text-xs text-base-content/25 italic">No bucket selected</span>
  {:else}
    {#each crumbs as crumb, i (crumb.prefix)}
      {#if i > 0}
        <span class="text-base-content/20 px-1 text-xs select-none">/</span>
      {/if}
      <button
        class="text-xs font-mono px-1 py-0.5 shrink-0 transition-colors hover:text-primary {i === crumbs.length - 1 ? 'text-primary font-semibold' : 'text-base-content/50'}"
        onclick={() => navigate(crumb)}
        title={crumb.prefix || crumb.name}
      >
        {crumb.name}
      </button>
    {/each}
  {/if}
</div>
