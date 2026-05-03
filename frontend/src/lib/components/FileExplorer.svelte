<script lang="ts">
  import { untrack } from "svelte";
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import HugeiconsIcon from "$lib/components/Icon.svelte";
  import { Folder01Icon } from "@hugeicons/core-free-icons";
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
    OpenDirectoryDialog,
    UploadFile,
    UploadFiles,
    SearchObjects,
  } from "$lib/wailsjs/go/main/App";
  import { appState } from "$lib/stores/appState.svelte";
  import type { S3Object } from "$lib/stores/appState.svelte";
  import NewFolderBar from "./explorer/NewFolderBar.svelte";
  import ClipboardBar from "./explorer/ClipboardBar.svelte";
  import FileActionBar from "./explorer/FileActionBar.svelte";
  import FileTable from "./explorer/FileTable.svelte";
  import FileContextMenu from "./explorer/FileContextMenu.svelte";
  import FileStatusBar from "./explorer/FileStatusBar.svelte";

  let listContainerEl = $state<HTMLDivElement | undefined>(undefined);
  let searchResults = $state<S3Object[] | null>(null);
  let searchBusy = $state(false);
  let searchSeq = 0;

  // Context menu
  let ctxMenu = $state<{ x: number; y: number; target: S3Object | null } | null>(null);

  // New-folder input
  let newFolderName = $state("");
  let creatingFolder = $state(false);

  // Data loading

  async function loadObjects(reset = false) {
    if (!appState.currentBucket) return;
    if (appState.isLoading) return;
    if (!reset && !appState.hasMore && appState.objects.length > 0) return;

    appState.isLoading = true;
    try {
      if (reset) {
        searchResults = null;
      }
      const token = reset ? "" : appState.continuationToken;
      const result = await ListObjects(
        appState.currentBucket,
        appState.currentPrefix,
        token,
        appState.settings.pageSize || 1000,
      );
      appState.objects = reset
        ? (result.objects ?? [])
        : [...appState.objects, ...(result.objects ?? [])];
      appState.continuationToken = result.nextContinuationToken ?? "";
      appState.hasMore = result.hasMore ?? false;
    } catch (e) {
      appState.notify(`Load failed: ${e}`, "error");
    } finally {
      appState.isLoading = false;
    }
  }

  // Trigger full reload when bucket / prefix changes
  $effect(() => {
    const bucket = appState.currentBucket;
    const prefix = appState.currentPrefix;
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

  // Debounced server-side search
  $effect(() => {
    const bucket = appState.currentBucket;
    const prefix = appState.currentPrefix;
    const query = appState.searchQuery.trim();
    void prefix;

    if (!bucket) {
      searchSeq++;
      searchBusy = false;
      searchResults = null;
      return;
    }

    if (!query) {
      searchSeq++;
      searchBusy = false;
      searchResults = null;
      return;
    }

    const timer = setTimeout(async () => {
      const requestId = ++searchSeq;
      searchBusy = true;
      try {
        const results = await SearchObjects(bucket, appState.currentPrefix, query, 2000);
        if (requestId !== searchSeq) return;
        searchResults = results ?? [];
      } catch (e) {
        if (requestId !== searchSeq) return;
        searchResults = [];
        appState.notify(`Search failed: ${e}`, "error");
      } finally {
        if (requestId === searchSeq) {
          searchBusy = false;
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  });

  const rowVirtualizer = createVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: 0,
    getScrollElement: () => listContainerEl ?? null,
    estimateSize: () => (appState.settings.showFileDetails ? 34 : 30),
    overscan: 14,
  });

  let lastVirtualCount = -1;
  let lastShowDetails = appState.settings.showFileDetails;

  $effect(() => {
    const count = filteredObjects.length;
    const showDetails = appState.settings.showFileDetails;
    if (count === lastVirtualCount && showDetails === lastShowDetails) {
      return;
    }
    lastVirtualCount = count;
    lastShowDetails = showDetails;

    untrack(() => {
      $rowVirtualizer.setOptions({
        count,
        getScrollElement: () => listContainerEl ?? null,
        estimateSize: () => (showDetails ? 34 : 30),
        overscan: 14,
      });
    });
  });

  // Virtualized infinite-loading trigger
  $effect(() => {
    const query = appState.searchQuery.trim();
    if (query) return;
    if (!appState.hasMore || appState.isLoading) return;

    const virtualItems = $rowVirtualizer.getVirtualItems();
    if (!virtualItems.length) return;

    const last = virtualItems[virtualItems.length - 1];
    if (last.index >= filteredObjects.length - 8) {
      untrack(() => void loadObjects(false));
    }
  });

  // Selection

  function handleRowClick(e: MouseEvent, obj: S3Object) {
    const key = obj.key;
    if (e.ctrlKey || e.metaKey) {
      const s = new Set(appState.selectedKeys);
      s.has(key) ? s.delete(key) : s.add(key);
      appState.selectedKeys = s;
    } else if (e.shiftKey && appState.selectedKeys.size > 0) {
      const keys = filteredObjects.map((o) => o.key);
      const last = [...appState.selectedKeys].pop()!;
      const a = keys.indexOf(last);
      const b = keys.indexOf(key);
      const range = keys.slice(Math.min(a, b), Math.max(a, b) + 1);
      appState.selectedKeys = new Set([...appState.selectedKeys, ...range]);
    }
  }

  function handleDblClick(obj: S3Object) {
    if (!obj.isFolder) return;
    appState.currentPrefix = obj.key;
    appState.objects = [];
    appState.continuationToken = "";
    appState.hasMore = false;
    appState.selectedKeys = new Set();
    appState.searchQuery = "";
  }

  function selectAll() {
    appState.selectedKeys = new Set(filteredObjects.map((o) => o.key));
  }

  // Context menu

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
    const menuW = 192;
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

  // File operations

  async function doDownload(obj?: S3Object) {
    const target =
      obj ?? filteredObjects.find((o) => appState.selectedKeys.has(o.key) && !o.isFolder);
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
      appState.notify(`Downloaded "${target.name}"`, "success");
    } catch (e) {
      appState.notify(`Download failed: ${e}`, "error");
    }
    closeCtx();
  }

  function doDelete() {
    const selected = [...appState.selectedKeys];
    if (selected.length === 0) return;
    const hasFolder = selected.some((k) => k.endsWith("/"));
    appState.deleteTarget = { bucket: appState.currentBucket!, keys: selected, hasFolder };
    appState.showDeleteConfirm = true;
    closeCtx();
  }

  function doCopy() {
    const selected = [...appState.selectedKeys];
    if (!selected.length || !appState.currentBucket) return;
    appState.clipboard = { operation: "copy", bucket: appState.currentBucket, keys: selected };
    appState.notify(`${selected.length} item(s) copied`, "info");
    closeCtx();
  }

  function doCut() {
    const selected = [...appState.selectedKeys];
    if (!selected.length || !appState.currentBucket) return;
    appState.clipboard = { operation: "cut", bucket: appState.currentBucket, keys: selected };
    appState.notify(`${selected.length} item(s) cut`, "info");
    closeCtx();
  }

  async function doPaste() {
    if (!appState.clipboard || !appState.currentBucket) return;
    const { operation, bucket: src, keys } = appState.clipboard;
    let succeeded = 0;
    let failed = 0;
    for (const key of keys) {
      try {
        const isFolder = key.endsWith("/");
        const name = key.split("/").filter(Boolean).pop() ?? key;
        if (isFolder) {
          const dstPrefix = appState.currentPrefix + name + "/";
          if (operation === "copy") {
            await CopyFolder(src, key, appState.currentBucket, dstPrefix);
          } else {
            await MoveFolder(src, key, appState.currentBucket, dstPrefix);
          }
        } else {
          const dstKey = appState.currentPrefix + name;
          if (operation === "copy") {
            await CopyObject(src, key, appState.currentBucket, dstKey);
          } else {
            await MoveObject(src, key, appState.currentBucket, dstKey);
          }
        }
        succeeded++;
      } catch (e) {
        console.error(`Paste item failed: ${key}`, e);
        failed++;
      }
    }
    if (operation === "cut") appState.clipboard = null;
    if (failed === 0) {
      appState.notify(`Pasted ${succeeded} item(s)`, "success");
    } else if (succeeded > 0) {
      appState.notify(`Pasted ${succeeded} item(s), ${failed} failed`, "warning");
    } else {
      appState.notify(`Paste failed for all ${failed} item(s)`, "error");
    }
    appState.refreshTrigger = Date.now();
    closeCtx();
  }

  function doPresignedUrl(obj?: S3Object) {
    const target =
      obj ?? filteredObjects.find((o) => appState.selectedKeys.has(o.key) && !o.isFolder);
    if (!target || target.isFolder) return;
    appState.presignedUrlTarget = {
      bucket: appState.currentBucket!,
      key: target.key,
      name: target.name,
    };
    appState.showPresignedUrl = true;
    closeCtx();
  }

  async function doCreateFolder() {
    if (!newFolderName.trim() || !appState.currentBucket) return;
    creatingFolder = true;
    try {
      await CreateFolder(appState.currentBucket, appState.currentPrefix, newFolderName.trim());
      appState.notify("Folder created", "success");
      appState.showNewFolder = false;
      newFolderName = "";
      appState.refreshTrigger = Date.now();
    } catch (e) {
      appState.notify(`Create folder failed: ${e}`, "error");
    } finally {
      creatingFolder = false;
    }
  }

  async function doUploadFolder() {
    if (!appState.currentBucket) return;
    try {
      const dir = await OpenDirectoryDialog();
      if (!dir) return;
      await UploadFile(appState.currentBucket, appState.currentPrefix, dir);
    } catch (e) {
      appState.notify(`Upload failed: ${e}`, "error");
      appState.uploadBatch = null;
    }
    closeCtx();
  }

  async function doUpload() {
    if (!appState.currentBucket) return;
    try {
      const files = await OpenMultipleFilesDialog();
      if (!files?.length) return;

      if (files.length > 1) {
        appState.uploadBatch = { total: files.length, done: 0, errors: 0 };
      }

      await UploadFiles(appState.currentBucket, appState.currentPrefix, files);

      if (files.length === 1) {
        appState.notify(`Uploaded "${files[0].split("/").pop()}"`, "success");
      }
      appState.refreshTrigger = Date.now();
    } catch (e) {
      appState.uploadBatch = null;
      appState.notify(`Upload failed: ${e}`, "error");
    }
    closeCtx();
  }

  // Keyboard shortcuts

  function handleKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      selectAll();
    }
    if (e.key === "Escape") {
      appState.selectedKeys = new Set();
      closeCtx();
    }
    if ((e.key === "Delete" || e.key === "Backspace") && appState.selectedKeys.size > 0) {
      doDelete();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "c") doCopy();
    if ((e.ctrlKey || e.metaKey) && e.key === "x") doCut();
    if ((e.ctrlKey || e.metaKey) && e.key === "v") void doPaste();
  }

  // Checkbox toggles

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

  // Derived helpers

  const filteredObjects = $derived.by(() => {
    const q = appState.searchQuery.toLowerCase().trim();
    if (q && searchResults !== null) return searchResults;
    if (!q) return appState.objects;
    return appState.objects.filter((o) => o.name.toLowerCase().includes(q));
  });

  const virtualRows = $derived($rowVirtualizer.getVirtualItems());

  const allChecked = $derived(
    filteredObjects.length > 0 && appState.selectedKeys.size === filteredObjects.length,
  );
  const someChecked = $derived(
    appState.selectedKeys.size > 0 && appState.selectedKeys.size < filteredObjects.length,
  );
  const multiSelected = $derived(appState.selectedKeys.size > 1);
  const hasSelectedFiles = $derived([...appState.selectedKeys].some((k) => !k.endsWith("/")));
</script>

<svelte:window onkeydown={handleKey} onclick={closeCtx} />

<div class="flex flex-col flex-1 overflow-hidden">
  {#if !appState.currentBucket}
    <div
      class="flex flex-col items-center justify-center flex-1 gap-3 text-base-content/15 select-none"
    >
      <HugeiconsIcon icon={Folder01Icon} size={72} />
      <p class="text-sm font-medium">Select a bucket from the sidebar</p>
    </div>
  {:else}
    {#if appState.showNewFolder}
      <NewFolderBar
        bind:newFolderName
        {creatingFolder}
        oncreate={doCreateFolder}
        oncancel={() => {
          appState.showNewFolder = false;
          newFolderName = "";
        }}
      />
    {/if}

    <ClipboardBar
      onpaste={doPaste}
      onclear={() => {
        appState.clipboard = null;
      }}
    />

    <FileActionBar
      {hasSelectedFiles}
      {searchBusy}
      oncopy={doCopy}
      oncut={doCut}
      ondownload={() => doDownload()}
      onpaste={doPaste}
      ondelete={doDelete}
    />

    <FileTable
      {filteredObjects}
      totalSize={$rowVirtualizer.getTotalSize()}
      {virtualRows}
      {allChecked}
      {someChecked}
      {multiSelected}
      {searchBusy}
      bind:listContainerEl
      onrowclick={handleRowClick}
      ondblclick={handleDblClick}
      oncontextmenu={openCtx}
      ontoggleall={toggleAll}
      ontogglecheck={toggleCheck}
      onopenItemMenu={openItemMenu}
      onupload={doUpload}
    />

    <FileStatusBar
      {filteredObjects}
      {searchBusy}
      {searchResults}
      onloadmore={() => loadObjects(false)}
    />
  {/if}
</div>

{#if ctxMenu}
  <FileContextMenu
    {ctxMenu}
    onclose={closeCtx}
    ondownload={(obj) => doDownload(obj)}
    onpresignedurl={(obj) => doPresignedUrl(obj)}
    oncopy={doCopy}
    oncut={doCut}
    onpaste={doPaste}
    ondelete={doDelete}
    onnewfolder={() => {
      appState.showNewFolder = true;
      closeCtx();
    }}
    onupload={doUpload}
    onuploadfolder={doUploadFolder}
  />
{/if}
