<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import { Copy01Icon, Cancel01Icon, Tick01Icon, Alert02Icon, InformationCircleIcon } from '@hugeicons/core-free-icons';
  import { appState } from '$lib/stores/appState.svelte';
</script>

{#if appState.notification}
  {@const t = appState.notification.type}
  <div class="fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-2">
    <div class="flex items-stretch rounded-box shadow-2xl overflow-hidden border border-base-300 bg-base-100">
      <!-- Color accent bar -->
      <div
        class="w-1.5 shrink-0"
        class:bg-success={t === 'success'}
        class:bg-error={t === 'error'}
        class:bg-warning={t === 'warning'}
        class:bg-info={t === 'info'}
      ></div>
      <!-- Icon -->
      <div class="flex items-center px-3">
        {#if t === 'success'}
          <span class="text-success"><HugeiconsIcon icon={Tick01Icon} size={18} /></span>
        {:else if t === 'error'}
          <span class="text-error"><HugeiconsIcon icon={Alert02Icon} size={18} /></span>
        {:else if t === 'warning'}
          <span class="text-warning"><HugeiconsIcon icon={Alert02Icon} size={18} /></span>
        {:else}
          <span class="text-info"><HugeiconsIcon icon={InformationCircleIcon} size={18} /></span>
        {/if}
      </div>
      <!-- Message -->
      <div class="flex-1 py-2.5 pr-1 text-sm text-base-content select-text wrap-break-word">
        {appState.notification.message}
      </div>
      <!-- Action buttons -->
      <div class="flex items-center gap-0.5 px-1.5 shrink-0">
        <button
          class="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0 p-0 text-base-content/40 hover:text-base-content/70"
          title="Copy to clipboard"
          onclick={() => { navigator.clipboard.writeText(appState.notification?.message ?? ''); }}
        >
          <HugeiconsIcon icon={Copy01Icon} size={13} />
        </button>
        <button
          class="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0 p-0 text-base-content/40 hover:text-base-content/70"
          title="Dismiss"
          onclick={() => { appState.notification = null; }}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} />
        </button>
      </div>
    </div>
  </div>
{/if}
