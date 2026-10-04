<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import { Delete02Icon, Alert02Icon } from '@hugeicons/core-free-icons';
  import { DeleteBucket } from '$bindings/oso/app';
  import { appState } from '$lib/stores/appState.svelte';

  let typed = $state('');
  let deleteContents = $state(false);
  let deleting = $state(false);
  let error = $state('');

  const name = $derived(appState.deleteBucketTarget ?? '');
  const confirmed = $derived(name !== '' && typed === name);

  /** Svelte action: focus element on mount */
  function focus(node: HTMLElement) { node.focus(); }

  async function confirm() {
    if (!confirmed || deleting) return;
    deleting = true;
    error = '';
    try {
      await DeleteBucket(name, deleteContents);
      appState.notify(`Bucket "${name}" deleted`, 'success');
      if (appState.currentBucket === name) {
        appState.currentBucket = null;
        appState.currentPrefix = '';
        appState.objects = [];
        appState.continuationToken = '';
        appState.hasMore = false;
        appState.selectedKeys = new Set();
        appState.propertiesTarget = null;
      }
      if (appState.clipboard?.bucket === name) appState.clipboard = null;
      appState.bucketsTrigger++;
      appState.deleteBucketTarget = null;
    } catch (e) {
      error = String(e);
    } finally {
      deleting = false;
    }
  }

  function cancel() {
    if (deleting) return;
    appState.deleteBucketTarget = null;
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center">
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="absolute inset-0 bg-black/60" onclick={cancel}></div>

  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    class="relative bg-base-200 border border-base-300 w-full max-w-md shadow-2xl"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="flex items-center gap-2 px-4 py-3 border-b border-base-300">
      <HugeiconsIcon icon={Alert02Icon} size={15} class="text-error" />
      <h3 class="text-sm font-semibold">Delete Bucket</h3>
    </div>

    <form class="p-4 flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void confirm(); }}>
      <p class="text-sm text-base-content/70 leading-relaxed">
        This permanently deletes the bucket <strong class="font-mono text-base-content">{name}</strong>.
        This action <strong>cannot be undone</strong>.
      </p>

      <label class="flex items-start gap-2.5 cursor-pointer select-none">
        <input type="checkbox" class="checkbox checkbox-sm checkbox-error mt-0.5" bind:checked={deleteContents} disabled={deleting} />
        <span class="text-sm">
          Delete all objects in the bucket first
          <span class="block text-xs text-base-content/40">S3 only deletes empty buckets. Large buckets take a while.</span>
        </span>
      </label>

      <div class="flex flex-col gap-1.5">
        <label for="delete-bucket-name" class="text-sm">
          Type <span class="font-mono font-semibold">{name}</span> to confirm
        </label>
        <input
          id="delete-bucket-name"
          type="text"
          class="input input-bordered input-sm bg-base-100 w-full font-mono text-xs"
          autocomplete="off"
          spellcheck="false"
          bind:value={typed}
          use:focus
          disabled={deleting}
          onkeydown={(e) => { if (e.key === 'Escape') cancel(); }}
        />
      </div>

      {#if error}
        <div class="flex items-start gap-2 bg-error/10 border border-error/20 text-error p-3 text-xs">
          <HugeiconsIcon icon={Alert02Icon} size={14} class="shrink-0 mt-0.5" />
          <span class="wrap-break-word min-w-0">{error}</span>
        </div>
      {/if}

      <div class="flex gap-2 justify-end">
        <button type="button" class="btn btn-ghost btn-sm" onclick={cancel} disabled={deleting}>Cancel</button>
        <button type="submit" class="btn btn-error btn-sm gap-2" disabled={!confirmed || deleting}>
          {#if deleting}
            <span class="loading loading-spinner loading-xs"></span>
            Deleting…
          {:else}
            <HugeiconsIcon icon={Delete02Icon} size={14} />
            Delete bucket
          {/if}
        </button>
      </div>
    </form>
  </div>
</div>
