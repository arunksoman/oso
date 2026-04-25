<script lang="ts">
  import { appState } from '$lib/stores/appState.svelte';
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import { Upload01Icon, Tick01Icon, Alert02Icon } from '@hugeicons/core-free-icons';

  const entries = $derived(Object.values(appState.uploads));
  const batch = $derived(appState.uploadBatch);

  // Single-file mode: panel visible when there are upload entries and no batch
  const singleVisible = $derived(!batch && entries.length > 0);
  const singleActive = $derived(entries.filter((e) => !e.done && !e.error).length);

  // Batch mode state
  const batchProgress = $derived(batch ? Math.round((batch.done / batch.total) * 100) : 0);
  const batchDone = $derived(!!batch && batch.done + batch.errors >= batch.total);
  const batchLabel = $derived(
    batch
      ? batchDone
        ? batch.errors > 0
          ? `${batch.done} uploaded, ${batch.errors} failed`
          : `${batch.done} of ${batch.total} files uploaded`
        : `Uploading ${batch.done + 1} of ${batch.total}…`
      : '',
  );
</script>

<!-- ─── Batch progress (multi-file) ─── -->
{#if batch}
  <div class="fixed bottom-4 right-4 z-50 w-72 bg-base-200 border border-base-300 shadow-2xl rounded-box overflow-hidden">
    <div class="flex items-center gap-2 px-3 py-2 border-b border-base-300">
      {#if batchDone}
        <HugeiconsIcon icon={batch.errors > 0 ? Alert02Icon : Tick01Icon}
          class={batch.errors > 0 ? 'text-warning shrink-0' : 'text-success shrink-0'}
          size={14}
        />
      {:else}
        <HugeiconsIcon icon={Upload01Icon} class="text-primary shrink-0 animate-pulse" size={14} />
      {/if}
      <span class="text-xs font-semibold flex-1 truncate text-base-content/80">{batchLabel}</span>
      <span class="text-xs tabular-nums text-base-content/40 shrink-0">{batchProgress}%</span>
    </div>
    <div class="px-3 py-2">
      <progress
        class="progress w-full h-1.5 {batchDone ? (batch.errors > 0 ? 'progress-warning' : 'progress-success') : 'progress-primary'}"
        value={batchProgress}
        max="100"
      ></progress>
    </div>
  </div>

<!-- ─── Single-file progress ─── -->
{:else if singleVisible}
  <div class="fixed bottom-4 right-4 z-40 w-72 bg-base-200 border border-base-300 shadow-2xl rounded-box overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-base-300">
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold uppercase tracking-widest text-base-content/40">Uploads</span>
        {#if singleActive > 0}
          <span class="badge badge-primary badge-xs">{singleActive}</span>
        {/if}
      </div>
      {#if singleActive === 0}
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
