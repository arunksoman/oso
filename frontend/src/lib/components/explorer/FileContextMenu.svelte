<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import {
    Delete02Icon,
    Download01Icon,
    Copy01Icon,
    Scissor01Icon,
    FilePasteIcon,
    Link03Icon,
    FolderAddIcon,
    Upload01Icon,
  } from '@hugeicons/core-free-icons';
  import { appState } from '$lib/stores/appState.svelte';
  import type { S3Object } from '$lib/stores/appState.svelte';

  let {
    ctxMenu,
    onclose,
    ondownload,
    onpresignedurl,
    oncopy,
    oncut,
    onpaste,
    ondelete,
    onnewfolder,
    onupload,
    onuploadfolder,
  }: {
    ctxMenu: { x: number; y: number; target: S3Object | null };
    onclose: () => void;
    ondownload: (obj: S3Object) => void;
    onpresignedurl: (obj: S3Object) => void;
    oncopy: () => void;
    oncut: () => void;
    onpaste: () => void;
    ondelete: () => void;
    onnewfolder: () => void;
    onupload: () => void;
    onuploadfolder: () => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed z-50 bg-base-200 border border-base-300 rounded-box shadow-2xl min-w-48 py-1"
  style="left:{Math.min(ctxMenu.x, window.innerWidth - 200)}px; top:{Math.min(ctxMenu.y, window.innerHeight - 300)}px;"
  onclick={(e) => e.stopPropagation()}
  oncontextmenu={(e) => e.preventDefault()}
  onkeydown={(e) => {
    if (e.key === 'Escape') onclose();
  }}
  role="menu"
  tabindex="-1"
>
  {#if ctxMenu.target}
    {@const t = ctxMenu.target}

    {#if !t.isFolder}
      <button
        class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left transition-colors"
        onclick={() => ondownload(t)}
      >
        <HugeiconsIcon icon={Download01Icon} size={14} class="text-base-content/60" />
        Download
      </button>
      <button
        class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left transition-colors"
        onclick={() => onpresignedurl(t)}
      >
        <HugeiconsIcon icon={Link03Icon} size={14} class="text-base-content/60" />
        Copy presigned URL
      </button>
      <div class="h-px bg-base-300 my-1"></div>
    {/if}

    <button
      class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left"
      onclick={oncopy}
    >
      <HugeiconsIcon icon={Copy01Icon} size={14} class="text-base-content/60" />
      Copy
    </button>
    <button
      class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left"
      onclick={oncut}
    >
      <HugeiconsIcon icon={Scissor01Icon} size={14} class="text-base-content/60" />
      Cut
    </button>
    {#if appState.clipboard}
      <button
        class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left"
        onclick={onpaste}
      >
        <HugeiconsIcon icon={FilePasteIcon} size={14} class="text-base-content/60" />
        Paste ({appState.clipboard.keys.length})
      </button>
    {/if}
    <div class="h-px bg-base-300 my-1"></div>
    <button
      class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-error/10 text-error text-left"
      onclick={ondelete}
    >
      <HugeiconsIcon icon={Delete02Icon} size={14} />
      Delete
    </button>
  {:else}
    <!-- Background right-click -->
    <button
      class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left"
      onclick={onnewfolder}
    >
      <HugeiconsIcon icon={FolderAddIcon} size={14} class="text-base-content/60" />
      New folder
    </button>
    <button
      class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left"
      onclick={onupload}
    >
      <HugeiconsIcon icon={Upload01Icon} size={14} class="text-base-content/60" />
      Upload files
    </button>
    <button
      class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left"
      onclick={onuploadfolder}
    >
      <HugeiconsIcon icon={FolderAddIcon} size={14} class="text-base-content/60" />
      Upload folder
    </button>
    {#if appState.clipboard}
      <div class="h-px bg-base-300 my-1"></div>
      <button
        class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left"
        onclick={onpaste}
      >
        <HugeiconsIcon icon={FilePasteIcon} size={14} class="text-base-content/60" />
        Paste ({appState.clipboard.keys.length})
      </button>
    {/if}
  {/if}
</div>
