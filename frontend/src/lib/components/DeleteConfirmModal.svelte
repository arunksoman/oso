<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Delete02Icon, Alert02Icon } from '@hugeicons/core-free-icons';
  import { DeleteObjects, DeleteFolder } from '$lib/wailsjs/go/main/App';
  import { appState } from '$lib/stores/appState.svelte';

  let deleting = $state(false);

  async function confirm() {
    if (!appState.deleteTarget) return;
    const { bucket, keys, hasFolder } = appState.deleteTarget;
    deleting = true;
    try {
      if (hasFolder) {
        const folderKeys = keys.filter((k) => k.endsWith('/'));
        const fileKeys = keys.filter((k) => !k.endsWith('/'));
        for (const fk of folderKeys) {
          await DeleteFolder(bucket, fk);
        }
        if (fileKeys.length > 0) await DeleteObjects(bucket, fileKeys);
      } else {
        await DeleteObjects(bucket, keys);
      }
      appState.notify(`Deleted ${keys.length} item(s)`, 'success');
      appState.selectedKeys = new Set();
      appState.refreshTrigger = Date.now();
    } catch (e) {
      appState.notify(`Delete failed: ${e}`, 'error');
    } finally {
      deleting = false;
      appState.showDeleteConfirm = false;
      appState.deleteTarget = null;
    }
  }

  function cancel() {
    appState.showDeleteConfirm = false;
    appState.deleteTarget = null;
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center">
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="absolute inset-0 bg-black/60" onclick={cancel}></div>

  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    class="relative bg-base-200 border border-base-300 w-full max-w-sm shadow-2xl"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="flex items-center gap-2 px-4 py-3 border-b border-base-300">
      <HugeiconsIcon icon={Alert02Icon} size={15} class="text-error" />
      <h3 class="text-sm font-semibold">Confirm Delete</h3>
    </div>

    <div class="p-4 flex flex-col gap-5">
      <p class="text-sm text-base-content/70 leading-relaxed">
        Delete <strong>{appState.deleteTarget?.keys.length ?? 0} item(s)</strong>?
        {#if appState.deleteTarget?.hasFolder}
          <span class="text-error font-medium"> Folders will be deleted recursively.</span>
        {/if}
        This action <strong>cannot be undone</strong>.
      </p>

      <div class="flex gap-2 justify-end">
        <button class="btn btn-ghost btn-sm" onclick={cancel} disabled={deleting}>Cancel</button>
        <button
          class="btn btn-error btn-sm gap-2"
          onclick={confirm}
          disabled={deleting}
        >
          {#if deleting}
            <span class="loading loading-spinner loading-xs"></span>
            Deleting…
          {:else}
            <HugeiconsIcon icon={Delete02Icon} size={14} />
            Delete
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>
