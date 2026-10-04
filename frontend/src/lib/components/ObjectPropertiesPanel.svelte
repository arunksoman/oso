<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import {
    InformationCircleIcon,
    Cancel01Icon,
    Add01Icon,
    Alert02Icon,
    Tag01Icon,
    Refresh01Icon,
  } from '@hugeicons/core-free-icons';
  import { GetObjectProperties, UpdateObjectProperties } from '$bindings/oso/app';
  import { appState } from '$lib/stores/appState.svelte';
  import type { ObjectProperties } from '$lib/stores/appState.svelte';
  import { getFileIcon } from '$lib/utils/fileIcons';
  import { formatFileSize, formatDate } from '$lib/utils/format';

  type MetadataRow = { key: string; value: string };

  let props = $state<ObjectProperties | null>(null);
  let loading = $state(false);
  let loadError = $state('');
  let saving = $state(false);
  let loadSeq = 0;

  // Editable copies
  let contentType = $state('');
  let metadata = $state<MetadataRow[]>([]);

  const target = $derived(appState.propertiesTarget);

  function toRows(values: Record<string, string>): MetadataRow[] {
    return Object.keys(values)
      .sort()
      .map((key) => ({ key, value: values[key] }));
  }

  function startEditing(loaded: ObjectProperties) {
    contentType = loaded.contentType;
    metadata = toRows(loaded.metadata);
  }

  async function load(bucket: string, key: string) {
    const seq = ++loadSeq;
    loading = true;
    loadError = '';
    try {
      const result = await GetObjectProperties(bucket, key);
      if (seq !== loadSeq) return;
      if (!result) throw new Error('object not found');
      props = { ...result, metadata: { ...(result.metadata as Record<string, string>) }, tags: { ...(result.tags as Record<string, string>) } };
      startEditing(props);
    } catch (e) {
      if (seq !== loadSeq) return;
      props = null;
      loadError = String(e);
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  $effect(() => {
    if (!target) return;
    void load(target.bucket, target.key);
  });

  // The panel belongs to the bucket it was opened in
  $effect(() => {
    if (target && target.bucket !== appState.currentBucket) appState.propertiesTarget = null;
  });

  const tags = $derived(props ? toRows(props.tags) : []);

  const dirty = $derived.by(() => {
    if (!props) return false;
    if (contentType.trim() !== props.contentType) return true;
    const original = toRows(props.metadata);
    return (
      original.length !== metadata.length ||
      metadata.some((row, i) => row.key.trim().toLowerCase() !== original[i].key || row.value !== original[i].value)
    );
  });

  const metadataError = $derived.by(() => {
    const seen: string[] = [];
    for (const row of metadata) {
      const key = row.key.trim().toLowerCase();
      if (!key) return 'Metadata keys must not be empty';
      if (/[\s:]/.test(key)) return `"${key}" is not a valid metadata key`;
      if (seen.includes(key)) return `"${key}" is used twice`;
      seen.push(key);
    }
    return '';
  });

  async function save() {
    if (!target || !props || metadataError) return;
    saving = true;
    try {
      const values: Record<string, string> = {};
      for (const row of metadata) values[row.key.trim().toLowerCase()] = row.value;
      await UpdateObjectProperties(target.bucket, target.key, contentType.trim(), values);
      appState.notify(`Updated "${target.name}"`, 'success');
      // The copy gives the object a new modification time
      appState.refreshTrigger = Date.now();
      await load(target.bucket, target.key);
    } catch (e) {
      appState.notify(`Update failed: ${e}`, 'error');
    } finally {
      saving = false;
    }
  }

  function close() {
    appState.propertiesTarget = null;
  }
</script>

{#if target}
  <aside class="w-80 shrink-0 flex flex-col border-l border-base-300 bg-base-200 overflow-hidden" aria-label="Object properties">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-base-300">
      <div class="flex items-center gap-2 text-base-content/50">
        <HugeiconsIcon icon={InformationCircleIcon} size={13} />
        <span class="text-xs font-bold uppercase tracking-widest">Properties</span>
      </div>
      <div class="flex items-center gap-0.5">
        <button
          class="btn btn-ghost btn-xs p-0.5 h-auto min-h-0"
          onclick={() => load(target.bucket, target.key)}
          disabled={loading || saving}
          title="Reload properties"
        >
          <span class={loading ? 'animate-spin' : ''}>
            <HugeiconsIcon icon={Refresh01Icon} size={13} />
          </span>
        </button>
        <button class="btn btn-ghost btn-xs p-0.5 h-auto min-h-0" onclick={close} title="Close properties">
          <HugeiconsIcon icon={Cancel01Icon} size={13} />
        </button>
      </div>
    </div>

    <!-- Object -->
    <div class="flex items-center gap-2.5 px-3 py-3 border-b border-base-300">
      <span class="text-base-content/60 shrink-0">
        <HugeiconsIcon icon={getFileIcon(target.name, false)} size={20} />
      </span>
      <div class="min-w-0">
        <p class="text-sm font-mono font-medium truncate" title={target.name}>{target.name}</p>
        <p class="text-xs font-mono text-base-content/40 truncate" title="s3://{target.bucket}/{target.key}">
          s3://{target.bucket}/{target.key}
        </p>
      </div>
    </div>

    {#if loading && !props}
      <div class="flex-1 flex items-center justify-center">
        <span class="loading loading-spinner loading-sm text-primary"></span>
      </div>
    {:else if loadError}
      <div class="p-3">
        <div class="flex items-start gap-2 bg-error/10 border border-error/20 text-error p-3 text-xs">
          <HugeiconsIcon icon={Alert02Icon} size={14} class="shrink-0 mt-0.5" />
          <span class="wrap-break-word min-w-0">{loadError}</span>
        </div>
      </div>
    {:else if props}
      <div class="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-4">
        <!-- Read-only details -->
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt class="text-base-content/40">Size</dt>
          <dd class="font-mono text-right">{formatFileSize(props.size)}</dd>
          <dt class="text-base-content/40">Modified</dt>
          <dd class="font-mono text-right">{formatDate(props.lastModified)}</dd>
          <dt class="text-base-content/40">Storage class</dt>
          <dd class="font-mono text-right">{props.storageClass}</dd>
          <dt class="text-base-content/40">ETag</dt>
          <dd class="font-mono text-right break-all select-text">{props.etag}</dd>
          {#if props.versionId}
            <dt class="text-base-content/40">Version</dt>
            <dd class="font-mono text-right break-all select-text">{props.versionId}</dd>
          {/if}
          {#if props.cacheControl}
            <dt class="text-base-content/40">Cache-Control</dt>
            <dd class="font-mono text-right break-all">{props.cacheControl}</dd>
          {/if}
          {#if props.contentDisposition}
            <dt class="text-base-content/40">Disposition</dt>
            <dd class="font-mono text-right break-all">{props.contentDisposition}</dd>
          {/if}
          {#if props.contentEncoding}
            <dt class="text-base-content/40">Encoding</dt>
            <dd class="font-mono text-right break-all">{props.contentEncoding}</dd>
          {/if}
        </dl>

        <!-- Content type -->
        <div class="flex flex-col gap-1 border-t border-base-300 pt-3">
          <label for="properties-content-type" class="text-xs font-bold uppercase tracking-widest text-base-content/30">Content-Type</label>
          <input
            id="properties-content-type"
            type="text"
            class="input input-bordered input-sm bg-base-100 w-full font-mono text-xs"
            placeholder="application/octet-stream"
            spellcheck="false"
            bind:value={contentType}
          />
        </div>

        <!-- Metadata -->
        <div class="flex flex-col gap-2 border-t border-base-300 pt-3">
          <div class="flex items-center justify-between">
            <p class="text-xs font-bold uppercase tracking-widest text-base-content/30">Metadata</p>
            <button
              class="btn btn-ghost btn-xs gap-1 h-auto min-h-0 py-0.5 text-base-content/50"
              onclick={() => { metadata = [...metadata, { key: '', value: '' }]; }}
            >
              <HugeiconsIcon icon={Add01Icon} size={12} />
              Add
            </button>
          </div>
          {#if metadata.length === 0}
            <p class="text-xs text-base-content/30">No user metadata</p>
          {/if}
          {#each metadata as row, i (i)}
            <div class="flex items-center gap-1">
              <input
                type="text"
                class="input input-bordered input-xs bg-base-100 w-2/5 font-mono text-xs"
                placeholder="key"
                aria-label="Metadata key {i + 1}"
                spellcheck="false"
                bind:value={row.key}
              />
              <input
                type="text"
                class="input input-bordered input-xs bg-base-100 flex-1 min-w-0 font-mono text-xs"
                placeholder="value"
                aria-label="Metadata value {i + 1}"
                spellcheck="false"
                bind:value={row.value}
              />
              <button
                class="btn btn-ghost btn-xs p-0.5 h-auto min-h-0 text-base-content/40 hover:text-error"
                onclick={() => { metadata = metadata.filter((_, index) => index !== i); }}
                title="Remove metadata {i + 1}"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} />
              </button>
            </div>
          {/each}
          {#if metadataError}
            <p class="text-xs text-error leading-tight">{metadataError}</p>
          {/if}
        </div>

        <!-- Tags -->
        <div class="flex flex-col gap-2 border-t border-base-300 pt-3">
          <p class="text-xs font-bold uppercase tracking-widest text-base-content/30">Tags</p>
          {#if tags.length === 0}
            <p class="text-xs text-base-content/30">No tags</p>
          {:else}
            <ul class="flex flex-wrap gap-1.5">
              {#each tags as tag (tag.key)}
                <li class="flex items-center gap-1.5 border border-base-300 bg-base-100 px-2 py-1 text-xs font-mono">
                  <HugeiconsIcon icon={Tag01Icon} size={11} class="text-base-content/40" />
                  <span>{tag.key}</span>
                  <span class="text-base-content/40">=</span>
                  <span>{tag.value}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="flex flex-col gap-2 px-3 py-2.5 border-t border-base-300 shrink-0">
        <p class="text-xs text-base-content/30 leading-tight">
          Saving copies the object onto itself, which updates its modified date.
        </p>
        <div class="flex justify-end gap-2">
          <button class="btn btn-ghost btn-sm" onclick={() => props && startEditing(props)} disabled={!dirty || saving}>
            Reset
          </button>
          <button class="btn btn-primary btn-sm gap-2" onclick={save} disabled={!dirty || saving || !!metadataError}>
            {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
            Save
          </button>
        </div>
      </div>
    {/if}
  </aside>
{/if}
