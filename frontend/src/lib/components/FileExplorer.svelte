<script lang="ts">
  import { untrack } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    Folder01Icon,
    Delete02Icon,
    Download01Icon,
    Copy01Icon,
    Scissor01Icon,
    FilePasteIcon,
    Link03Icon,
    FolderAddIcon,
    Upload01Icon,
    MoreVerticalIcon,
  } from '@hugeicons/core-free-icons';
  import {
    ListObjects,
    DownloadObject,
    SaveFileDialog,
    CreateFolder,
    CopyObject,
    CopyFolder,
    MoveObject,
    MoveFolder,
    OpenMultipleFilesDialog,
    UploadFiles,
  } from '$lib/wailsjs/go/main/App';
  import { appState } from '$lib/stores/appState.svelte';
  import type { S3Object } from '$lib/stores/appState.svelte';
  import { getFileIcon } from '$lib/utils/fileIcons';
  import { formatFileSize, formatDate, getFileType } from '$lib/utils/format';

  // Load-more sentinel
  let loadMoreEl = $state<HTMLDivElement | undefined>(undefined);
  let observer: IntersectionObserver;

  // Context menu
  let ctxMenu = $state<{ x: number; y: number; target: S3Object | null } | null>(null);

  // New-folder input
  let newFolderName = $state('');
  let creatingFolder = $state(false);

  // ─── Data loading ────────────────────────────────────────────────────────────

  async function loadObjects(reset = false) {
    if (!appState.currentBucket) return;
    if (appState.isLoading) return;
    if (!reset && !appState.hasMore && appState.objects.length > 0) return;

    appState.isLoading = true;
    try {
      const token = reset ? '' : appState.continuationToken;
      const result = await ListObjects(
        appState.currentBucket,
        appState.currentPrefix,
        token,
        100,
      );
      appState.objects = reset ? (result.objects ?? []) : [...appState.objects, ...(result.objects ?? [])];
      appState.continuationToken = result.nextContinuationToken ?? '';
      appState.hasMore = result.hasMore ?? false;
    } catch (e) {
      appState.notify(`Load failed: ${e}`, 'error');
    } finally {
      appState.isLoading = false;
    }
  }

  // Trigger full reload when bucket / prefix changes
  $effect(() => {
    const bucket = appState.currentBucket;
    const prefix = appState.currentPrefix; // track both
    void prefix;
    if (bucket !== null && bucket !== undefined) {
      untrack(() => void loadObjects(true));
    }
  });

  // Trigger reload on manual refresh
  $effect(() => {
    const trigger = appState.refreshTrigger;
    if (trigger > 0) {
      untrack(() => {
        if (appState.currentBucket) void loadObjects(true);
      });
    }
  });

  // Infinite-scroll observer
  $effect(() => {
    if (!loadMoreEl) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && appState.hasMore && !appState.isLoading) {
          void loadObjects(false);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(loadMoreEl);
    return () => observer?.disconnect();
  });

  // ─── Selection ───────────────────────────────────────────────────────────────

  function handleRowClick(e: MouseEvent, obj: S3Object) {
    const key = obj.key;
    if (e.ctrlKey || e.metaKey) {
      const s = new Set(appState.selectedKeys);
      s.has(key) ? s.delete(key) : s.add(key);
      appState.selectedKeys = s;
    } else if (e.shiftKey && appState.selectedKeys.size > 0) {
      const keys = appState.objects.map((o) => o.key);
      const last = [...appState.selectedKeys].pop()!;
      const a = keys.indexOf(last);
      const b = keys.indexOf(key);
      const range = keys.slice(Math.min(a, b), Math.max(a, b) + 1);
      appState.selectedKeys = new Set([...appState.selectedKeys, ...range]);
    }
    // Plain click without modifier does nothing — use checkbox or Ctrl+click
  }

  function handleDblClick(obj: S3Object) {
    if (!obj.isFolder) return;
    appState.currentPrefix = obj.key;
    appState.objects = [];
    appState.continuationToken = '';
    appState.hasMore = false;
    appState.selectedKeys = new Set();
    appState.searchQuery = '';
  }

  function selectAll() {
    appState.selectedKeys = new Set(appState.objects.map((o) => o.key));
  }

  // ─── Context menu ────────────────────────────────────────────────────────────

  function openCtx(e: MouseEvent, target: S3Object | null) {
    e.preventDefault();
    e.stopPropagation();
    ctxMenu = { x: e.clientX, y: e.clientY, target };
    if (target && !appState.selectedKeys.has(target.key)) {
      appState.selectedKeys = new Set([target.key]);
    }
  }

  function openItemMenu(e: MouseEvent, obj: S3Object) {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const menuW = 192; // min-w-48 = 12rem ≈ 192px
    let x = rect.left - menuW;
    if (x < 0) x = rect.right;
    ctxMenu = { x, y: rect.bottom, target: obj };
    if (!appState.selectedKeys.has(obj.key)) {
      appState.selectedKeys = new Set([obj.key]);
    }
  }

  function closeCtx() {
    ctxMenu = null;
  }

  // ─── File operations ─────────────────────────────────────────────────────────

  async function doDownload(obj?: S3Object) {
    const target = obj ?? appState.objects.find((o) => appState.selectedKeys.has(o.key) && !o.isFolder);
    if (!target || target.isFolder) return;

    let dest: string;
    if (appState.settings.askBeforeDownload) {
      dest = await SaveFileDialog(target.name);
      if (!dest) return;
    } else {
      dest = `${appState.settings.defaultDownloadPath}/${target.name}`;
    }
    try {
      await DownloadObject(appState.currentBucket!, target.key, dest);
      appState.notify(`Downloaded "${target.name}"`, 'success');
    } catch (e) {
      appState.notify(`Download failed: ${e}`, 'error');
    }
    closeCtx();
  }

  function doDelete() {
    const selected = [...appState.selectedKeys];
    if (selected.length === 0) return;
    const hasFolder = selected.some((k) => k.endsWith('/'));
    appState.deleteTarget = { bucket: appState.currentBucket!, keys: selected, hasFolder };
    appState.showDeleteConfirm = true;
    closeCtx();
  }

  function doCopy() {
    const selected = [...appState.selectedKeys];
    if (!selected.length || !appState.currentBucket) return;
    appState.clipboard = { operation: 'copy', bucket: appState.currentBucket, keys: selected };
    appState.notify(`${selected.length} item(s) copied`, 'info');
    closeCtx();
  }

  function doCut() {
    const selected = [...appState.selectedKeys];
    if (!selected.length || !appState.currentBucket) return;
    appState.clipboard = { operation: 'cut', bucket: appState.currentBucket, keys: selected };
    appState.notify(`${selected.length} item(s) cut`, 'info');
    closeCtx();
  }

  async function doPaste() {
    if (!appState.clipboard || !appState.currentBucket) return;
    const { operation, bucket: src, keys } = appState.clipboard;
    try {
      for (const key of keys) {
        const isFolder = key.endsWith('/');
        const name = key.split('/').filter(Boolean).pop() ?? key;
        if (isFolder) {
          const dstPrefix = appState.currentPrefix + name + '/';
          if (operation === 'copy') {
            await CopyFolder(src, key, appState.currentBucket, dstPrefix);
          } else {
            await MoveFolder(src, key, appState.currentBucket, dstPrefix);
          }
        } else {
          const dstKey = appState.currentPrefix + name;
          if (operation === 'copy') {
            await CopyObject(src, key, appState.currentBucket, dstKey);
          } else {
            await MoveObject(src, key, appState.currentBucket, dstKey);
          }
        }
      }
      if (operation === 'cut') appState.clipboard = null;
      appState.notify(`Pasted ${keys.length} item(s)`, 'success');
      appState.refreshTrigger = Date.now();
    } catch (e) {
      appState.notify(`Paste failed: ${e}`, 'error');
    }
    closeCtx();
  }

  function doPresignedUrl(obj?: S3Object) {
    const target = obj ?? appState.objects.find((o) => appState.selectedKeys.has(o.key) && !o.isFolder);
    if (!target || target.isFolder) return;
    appState.presignedUrlTarget = { bucket: appState.currentBucket!, key: target.key, name: target.name };
    appState.showPresignedUrl = true;
    closeCtx();
  }

  async function doCreateFolder() {
    if (!newFolderName.trim() || !appState.currentBucket) return;
    creatingFolder = true;
    try {
      await CreateFolder(appState.currentBucket, appState.currentPrefix, newFolderName.trim());
      appState.notify('Folder created', 'success');
      appState.showNewFolder = false;
      newFolderName = '';
      appState.refreshTrigger = Date.now();
    } catch (e) {
      appState.notify(`Create folder failed: ${e}`, 'error');
    } finally {
      creatingFolder = false;
    }
  }

  async function doUpload() {
    if (!appState.currentBucket) return;
    try {
      const files = await OpenMultipleFilesDialog();
      if (!files?.length) return;
      await UploadFiles(appState.currentBucket, appState.currentPrefix, files);
      appState.notify(`Uploaded ${files.length} file(s)`, 'success');
      appState.refreshTrigger = Date.now();
    } catch (e) {
      appState.notify(`Upload failed: ${e}`, 'error');
    }
    closeCtx();
  }

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────

  function handleKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      selectAll();
    }
    if (e.key === 'Escape') {
      appState.selectedKeys = new Set();
      closeCtx();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && appState.selectedKeys.size > 0) {
      doDelete();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') doCopy();
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') doCut();
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') void doPaste();
  }

  // ─── Checkbox toggle ─────────────────────────────────────────────────────────

  function toggleCheck(e: Event, obj: S3Object) {
    e.stopPropagation();
    const s = new Set(appState.selectedKeys);
    s.has(obj.key) ? s.delete(obj.key) : s.add(obj.key);
    appState.selectedKeys = s;
  }

  function toggleAll() {
    if (appState.selectedKeys.size === filteredObjects.length) {
      appState.selectedKeys = new Set();
    } else {
      appState.selectedKeys = new Set(filteredObjects.map((o) => o.key));
    }
  }

  // ─── Derived helpers ─────────────────────────────────────────────────────────

  const filteredObjects = $derived.by(() => {
    const q = appState.searchQuery.toLowerCase().trim();
    if (!q) return appState.objects;
    return appState.objects.filter((o) => o.name.toLowerCase().includes(q));
  });

  const allChecked = $derived(filteredObjects.length > 0 && appState.selectedKeys.size === filteredObjects.length);
  const someChecked = $derived(appState.selectedKeys.size > 0 && appState.selectedKeys.size < filteredObjects.length);
  const multiSelected = $derived(appState.selectedKeys.size > 1);
  const hasSelectedFiles = $derived([...appState.selectedKeys].some((k) => !k.endsWith('/')));
</script>

<svelte:window onkeydown={handleKey} onclick={closeCtx} />

<div class="flex flex-col flex-1 overflow-hidden">
  {#if !appState.currentBucket}
    <!-- Empty / no bucket selected -->
    <div class="flex flex-col items-center justify-center flex-1 gap-3 text-base-content/15 select-none">
      <HugeiconsIcon icon={Folder01Icon} size={72} />
      <p class="text-sm font-medium">Select a bucket from the sidebar</p>
    </div>
  {:else}
    <!-- New folder bar -->
    {#if appState.showNewFolder}
      <div class="flex items-center gap-2 px-4 py-2 bg-base-200 border-b border-base-300 shrink-0">
        <HugeiconsIcon icon={FolderAddIcon} size={14} class="text-base-content/40" />
        <input
          class="input input-bordered input-xs bg-base-100 w-48 font-mono"
          placeholder="folder-name"
          bind:value={newFolderName}
          autofocus
          onkeydown={(e) => {
            if (e.key === 'Enter') void doCreateFolder();
            if (e.key === 'Escape') { appState.showNewFolder = false; newFolderName = ''; }
          }}
        />
        <button class="btn btn-primary btn-xs px-3" onclick={doCreateFolder} disabled={creatingFolder || !newFolderName.trim()}>
          {#if creatingFolder}<span class="loading loading-spinner loading-xs"></span>{:else}Create{/if}
        </button>
        <button class="btn btn-ghost btn-xs" onclick={() => { appState.showNewFolder = false; newFolderName = ''; }}>Cancel</button>
      </div>
    {/if}



    <!-- Clipboard hint bar -->
    {#if appState.clipboard && appState.selectedKeys.size === 0}
      <div class="flex items-center gap-2 px-4 py-1.5 bg-info/8 border-b border-info/15 text-xs shrink-0">
        <HugeiconsIcon icon={FilePasteIcon} size={13} class="text-info" />
        <span class="text-info/70">{appState.clipboard.keys.length} item(s) ready to {appState.clipboard.operation}</span>
        <button class="btn btn-info btn-xs h-5 min-h-0 px-2 ml-2 text-xs" onclick={doPaste}>Paste here</button>
        <button class="btn btn-ghost btn-xs h-5 min-h-0 px-2 text-xs" onclick={() => { appState.clipboard = null; }}>Clear</button>
      </div>
    {/if}

    <!-- Bulk operations bar -->
    {#if appState.selectedKeys.size > 0}
      <div class="flex items-center gap-2 px-4 py-1.5 bg-primary/8 border-b border-primary/15 text-xs shrink-0 select-none">
        <span class="text-primary font-semibold">{appState.selectedKeys.size} selected</span>
        <div class="flex items-center gap-1 ml-2">
          <button class="btn btn-ghost btn-xs h-5 min-h-0 px-2 gap-1 text-xs" onclick={doCopy} title="Copy">
            <HugeiconsIcon icon={Copy01Icon} size={12} />
            Copy
          </button>
          <button class="btn btn-ghost btn-xs h-5 min-h-0 px-2 gap-1 text-xs" onclick={doCut} title="Cut">
            <HugeiconsIcon icon={Scissor01Icon} size={12} />
            Cut
          </button>
          {#if hasSelectedFiles}
            <button class="btn btn-ghost btn-xs h-5 min-h-0 px-2 gap-1 text-xs" onclick={() => doDownload()} title="Download">
              <HugeiconsIcon icon={Download01Icon} size={12} />
              Download
            </button>
          {/if}
          {#if appState.clipboard}
            <button class="btn btn-ghost btn-xs h-5 min-h-0 px-2 gap-1 text-xs" onclick={doPaste} title="Paste">
              <HugeiconsIcon icon={FilePasteIcon} size={12} />
              Paste
            </button>
          {/if}
          <span class="w-px h-3.5 bg-base-300 mx-1"></span>
          <button class="btn btn-ghost btn-xs h-5 min-h-0 px-2 gap-1 text-xs text-error hover:bg-error/10" onclick={doDelete} title="Delete selected">
            <HugeiconsIcon icon={Delete02Icon} size={12} />
            Delete
          </button>
        </div>
        <button class="ml-auto text-base-content/30 hover:text-base-content/60 text-xs" onclick={() => { appState.selectedKeys = new Set(); }}>
          Clear
        </button>
      </div>
    {/if}

    <!-- File table -->
    <div
      class="flex-1 overflow-y-auto"
      oncontextmenu={(e) => openCtx(e, null)}
    >
      {#if appState.objects.length === 0 && !appState.isLoading}
        <div
          class="flex flex-col items-center justify-center h-full gap-3 text-base-content/15 select-none"
          role="region"
          aria-label="Empty folder"
        >
          <HugeiconsIcon icon={Folder01Icon} size={56} />
          <p class="text-sm">This folder is empty</p>
          <button
            class="btn btn-ghost btn-xs gap-1.5 text-base-content/30 mt-1"
            onclick={doUpload}
          >
            <HugeiconsIcon icon={Upload01Icon} size={13} />
            Upload files
          </button>
        </div>
      {:else}
        <table class="table table-sm w-full">
          <thead class="sticky top-0 z-10 bg-base-200">
            <tr class="border-b border-base-300">
              <th class="py-2 px-2 w-8">
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs checkbox-primary"
                  checked={allChecked}
                  indeterminate={someChecked}
                  onchange={toggleAll}
                />
              </th>
              <th class="py-2 px-2 text-xs font-semibold uppercase tracking-wider text-base-content/35 text-left w-full">Name</th>
              {#if appState.settings.showFileDetails}
                <th class="py-2 px-4 text-xs font-semibold uppercase tracking-wider text-base-content/35 whitespace-nowrap text-right">Size</th>
                <th class="py-2 px-4 text-xs font-semibold uppercase tracking-wider text-base-content/35 whitespace-nowrap">Type</th>
                <th class="py-2 px-4 text-xs font-semibold uppercase tracking-wider text-base-content/35 whitespace-nowrap">Modified</th>
              {/if}
              <th class="py-2 px-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredObjects as obj (obj.key)}
              {@const icon = getFileIcon(obj.name, obj.isFolder)}
              {@const sel = appState.selectedKeys.has(obj.key)}
              {@const clipped = !!appState.clipboard?.keys.includes(obj.key)}
              <tr
                class="border-b border-base-200/60 cursor-pointer transition-colors group"
                class:bg-primary={sel}
                class:text-primary-content={sel}
                class:opacity-50={clipped && !sel}
                onclick={(e) => handleRowClick(e, obj)}
                ondblclick={() => handleDblClick(obj)}
                oncontextmenu={(e) => openCtx(e, obj)}
              >
                <td class="py-1.5 px-2 w-8" onclick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs checkbox-primary"
                    checked={sel}
                    onchange={(e) => toggleCheck(e, obj)}
                  />
                </td>
                <td class="py-1.5 px-2">
                  <div class="flex items-center gap-2.5">
                    <span class={sel ? 'text-primary-content/60' : obj.isFolder ? 'text-yellow-400/70' : 'text-base-content/30 group-hover:text-base-content/50'}>
                      <HugeiconsIcon icon={icon} size={15} />
                    </span>
                    <span class="text-sm font-mono truncate" class:italic={clipped && !sel}>{obj.name}</span>
                    {#if clipped}
                      <span class="text-xs opacity-40 ml-1">({appState.clipboard?.operation})</span>
                    {/if}
                  </div>
                </td>
                {#if appState.settings.showFileDetails}
                  <td class="py-1.5 px-4 text-xs font-mono text-right whitespace-nowrap" class:opacity-50={!sel} class:opacity-100={sel}>
                    {obj.isFolder ? '—' : formatFileSize(obj.size)}
                  </td>
                  <td class="py-1.5 px-4 text-xs font-mono whitespace-nowrap" class:opacity-50={!sel} class:opacity-100={sel}>
                    {getFileType(obj.name, obj.isFolder)}
                  </td>
                  <td class="py-1.5 px-4 text-xs font-mono whitespace-nowrap" class:opacity-50={!sel} class:opacity-100={sel}>
                    {obj.isFolder ? '—' : formatDate(obj.lastModified)}
                  </td>
                {/if}
                <td class="py-1.5 px-2 w-8">
                  {#if !multiSelected}
                    <button
                      class="btn btn-ghost btn-xs btn-square p-0 h-6 w-6 min-h-0 opacity-0 group-hover:opacity-60 hover:opacity-100! transition-opacity"
                      class:opacity-60={sel}
                      onclick={(e) => openItemMenu(e, obj)}
                      title="Actions"
                    >
                      <HugeiconsIcon icon={MoreVerticalIcon} size={14} />
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        <!-- Infinite scroll sentinel -->
        <div bind:this={loadMoreEl} class="py-5 flex justify-center">
          {#if appState.isLoading}
            <span class="loading loading-spinner loading-xs text-primary/40"></span>
          {:else if appState.hasMore}
            <button class="btn btn-ghost btn-xs text-base-content/30" onclick={() => loadObjects(false)}>
              Load more
            </button>
          {:else if appState.objects.length > 0}
            <span class="text-xs text-base-content/15">{appState.objects.length} items</span>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Context menu -->
{#if ctxMenu}
  <div
    class="fixed z-50 bg-base-200 border border-base-300 rounded-box shadow-2xl min-w-48 py-1"
    style="left:{Math.min(ctxMenu.x, window.innerWidth - 200)}px; top:{Math.min(ctxMenu.y, window.innerHeight - 300)}px;"
    onclick={(e) => e.stopPropagation()}
    oncontextmenu={(e) => e.preventDefault()}
  >
    {#if ctxMenu.target}
      {@const t = ctxMenu.target}

      {#if !t.isFolder}
        <button
          class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left transition-colors"
          onclick={() => doDownload(t)}
        >
          <HugeiconsIcon icon={Download01Icon} size={14} class="text-base-content/40" />
          Download
        </button>
        <button
          class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left transition-colors"
          onclick={() => doPresignedUrl(t)}
        >
          <HugeiconsIcon icon={Link03Icon} size={14} class="text-base-content/40" />
          Copy presigned URL
        </button>
        <div class="h-px bg-base-300 my-1"></div>
      {/if}

      <button class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left" onclick={doCopy}>
        <HugeiconsIcon icon={Copy01Icon} size={14} class="text-base-content/40" />
        Copy
      </button>
      <button class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left" onclick={doCut}>
        <HugeiconsIcon icon={Scissor01Icon} size={14} class="text-base-content/40" />
        Cut
      </button>
      {#if appState.clipboard}
        <button class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left" onclick={doPaste}>
          <HugeiconsIcon icon={FilePasteIcon} size={14} class="text-base-content/40" />
          Paste ({appState.clipboard.keys.length})
        </button>
      {/if}
      <div class="h-px bg-base-300 my-1"></div>
      <button class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-error/10 text-error text-left" onclick={doDelete}>
        <HugeiconsIcon icon={Delete02Icon} size={14} />
        Delete
      </button>
    {:else}
      <!-- Background right-click -->
      <button class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left" onclick={() => { appState.showNewFolder = true; closeCtx(); }}>
        <HugeiconsIcon icon={FolderAddIcon} size={14} class="text-base-content/40" />
        New folder
      </button>
      <button class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left" onclick={doUpload}>
        <HugeiconsIcon icon={Upload01Icon} size={14} class="text-base-content/40" />
        Upload files
      </button>
      {#if appState.clipboard}
        <div class="h-px bg-base-300 my-1"></div>
        <button class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-base-300 text-left" onclick={doPaste}>
          <HugeiconsIcon icon={FilePasteIcon} size={14} class="text-base-content/40" />
          Paste ({appState.clipboard.keys.length})
        </button>
      {/if}
    {/if}
  </div>
{/if}
