<script lang="ts">
  import { appState } from '$lib/stores/appState.svelte';

  const entries = $derived(Object.values(appState.uploads));
  const visible = $derived(entries.length > 0);
  const active = $derived(entries.filter((e) => !e.done && !e.error).length);
</script>

{#if visible}
  <div class="fixed bottom-4 right-4 z-40 w-72 bg-base-200 border border-base-300 shadow-2xl">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-base-300">
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Uploads</span>
        {#if active > 0}
          <span class="badge badge-primary badge-xs">{active}</span>
        {/if}
      </div>
      {#if active === 0}
        <button
          class="text-xs text-base-content/30 hover:text-base-content/60"
          onclick={() => { appState.uploads = {}; }}
        >
          Clear
        </button>
      {/if}
    </div>

    <!-- Upload entries -->
    <div class="max-h-56 overflow-y-auto divide-y divide-base-300/50">
      {#each entries as entry (entry.key)}
        <div class="px-3 py-2">
          <div class="flex items-center justify-between mb-1">
            <p class="text-xs font-mono truncate flex-1 text-base-content/70" title={entry.key}>
              {entry.key.split('/').filter(Boolean).pop() ?? entry.key}
            </p>
            <span class="ml-2 text-xs shrink-0 {entry.done ? 'text-success' : entry.error ? 'text-error' : 'text-base-content/30'}">
              {#if entry.done}✓{:else if entry.error}✗{:else}{Math.round(entry.progress)}%{/if}
            </span>
          </div>
          {#if !entry.done && !entry.error}
            <progress class="progress progress-primary w-full h-1" value={entry.progress} max="100"></progress>
          {:else if entry.error}
            <p class="text-error text-xs truncate" title={entry.error}>{entry.error}</p>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}
