<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import { Folder01Icon, MoreVerticalIcon, Upload01Icon } from '@hugeicons/core-free-icons';
  import { appState } from '$lib/stores/appState.svelte';
  import type { S3Object } from '$lib/stores/appState.svelte';
  import { getFileIcon } from '$lib/utils/fileIcons';
  import { formatFileSize, formatDate, getFileType } from '$lib/utils/format';

  let {
    filteredObjects,
    totalSize,
    virtualRows,
    allChecked,
    someChecked,
    multiSelected,
    searchBusy,
    listContainerEl = $bindable(),
    onrowclick,
    ondblclick,
    oncontextmenu,
    ontoggleall,
    ontogglecheck,
    onopenItemMenu,
    onupload,
  }: {
    filteredObjects: S3Object[];
    totalSize: number;
    virtualRows: { index: number; size: number; start: number }[];
    allChecked: boolean;
    someChecked: boolean;
    multiSelected: boolean;
    searchBusy: boolean;
    listContainerEl: HTMLDivElement | undefined;
    onrowclick: (e: MouseEvent, obj: S3Object) => void;
    ondblclick: (obj: S3Object) => void;
    oncontextmenu: (e: MouseEvent, obj: S3Object | null) => void;
    ontoggleall: () => void;
    ontogglecheck: (e: Event, obj: S3Object) => void;
    onopenItemMenu: (e: MouseEvent, obj: S3Object) => void;
    onupload: () => void;
  } = $props();
</script>

<div
  class="flex-1 overflow-y-auto"
  bind:this={listContainerEl}
  role="region"
  oncontextmenu={(e) => oncontextmenu(e, null)}
>
  {#if filteredObjects.length === 0 && !appState.isLoading && !searchBusy}
    <div
      class="flex flex-col items-center justify-center h-full gap-3 text-base-content/15 select-none"
      role="region"
      aria-label="Empty folder"
    >
      <HugeiconsIcon icon={Folder01Icon} size={56} />
      <p class="text-sm">This folder is empty</p>
      <button
        class="btn btn-ghost btn-xs gap-1.5 text-base-content/30 mt-1"
        onclick={onupload}
      >
        <HugeiconsIcon icon={Upload01Icon} size={13} />
        Upload files
      </button>
    </div>
  {:else}
    <div style="height: {totalSize}px; position: relative;">
      <table class="table table-sm w-full">
        <thead class="sticky top-0 z-10 bg-base-200">
          <tr>
            <th class="py-2 px-2 w-8">
              <input
                type="checkbox"
                class="checkbox checkbox-xs checkbox-primary"
                checked={allChecked}
                indeterminate={someChecked}
                onchange={ontoggleall}
              />
            </th>
            <th
              class="py-2 px-2 text-xs font-semibold uppercase tracking-wider text-base-content/35 text-left w-full"
              >Name</th
            >
            {#if appState.settings.showFileDetails}
              <th
                class="py-2 px-4 text-xs font-semibold uppercase tracking-wider text-base-content/35 whitespace-nowrap text-right"
                >Size</th
              >
              <th
                class="py-2 px-4 text-xs font-semibold uppercase tracking-wider text-base-content/35 whitespace-nowrap"
                >Type</th
              >
              <th
                class="py-2 px-4 text-xs font-semibold uppercase tracking-wider text-base-content/35 whitespace-nowrap"
                >Modified</th
              >
            {/if}
            <th class="py-2 px-2 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {#each virtualRows as row, idx (row.index)}
            {@const obj = filteredObjects[row.index]}
            {#if obj}
              {@const icon = getFileIcon(obj.name, obj.isFolder)}
              {@const sel = appState.selectedKeys.has(obj.key)}
              {@const clipped = !!appState.clipboard?.keys.includes(obj.key)}
              <tr
                style="height: {row.size}px; transform: translateY({row.start - idx * row.size}px);"
                class="cursor-pointer transition-colors group"
                class:bg-primary={sel}
                class:text-primary-content={sel}
                class:opacity-50={clipped && !sel}
                onclick={(e) => onrowclick(e, obj)}
                ondblclick={() => ondblclick(obj)}
                oncontextmenu={(e) => oncontextmenu(e, obj)}
              >
                <td class="py-1.5 px-2 w-8" onclick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    class={`checkbox checkbox-xs ${sel ? 'border-white' : 'checkbox-primary'}`}
                    checked={sel}
                    onchange={(e) => ontogglecheck(e, obj)}
                  />
                </td>
                <td class="py-1.5 px-2">
                  <div class="flex items-center gap-2.5">
                    <span
                      class={sel
                        ? 'text-primary-content/80'
                        : obj.isFolder
                          ? 'text-warning/85'
                          : 'text-base-content/60 group-hover:text-base-content/90'}
                    >
                      <HugeiconsIcon {icon} size={15} />
                    </span>
                    <span class="text-sm font-mono truncate" class:italic={clipped && !sel}
                      >{obj.name}</span
                    >
                    {#if clipped}
                      <span class="text-xs opacity-40 ml-1">({appState.clipboard?.operation})</span>
                    {/if}
                  </div>
                </td>
                {#if appState.settings.showFileDetails}
                  <td class="py-1.5 px-4 text-xs font-mono text-right whitespace-nowrap">
                    <span class:opacity-50={!sel}
                      >{obj.isFolder ? '—' : formatFileSize(obj.size)}</span
                    >
                  </td>
                  <td class="py-1.5 px-4 text-xs font-mono whitespace-nowrap">
                    <span class:opacity-50={!sel}>{getFileType(obj.name, obj.isFolder)}</span>
                  </td>
                  <td class="py-1.5 px-4 text-xs font-mono whitespace-nowrap">
                    <span class:opacity-50={!sel}
                      >{obj.isFolder ? '—' : formatDate(obj.lastModified)}</span
                    >
                  </td>
                {/if}
                <td class="py-1.5 px-2 w-8">
                  <button
                    class="btn btn-ghost btn-xs btn-square p-0 h-6 w-6 min-h-0 opacity-0 group-hover:opacity-80 hover:opacity-100! transition-opacity"
                    class:opacity-80={sel}
                    class:invisible={multiSelected}
                    onclick={(e) => onopenItemMenu(e, obj)}
                    title="Actions"
                  >
                    <HugeiconsIcon icon={MoreVerticalIcon} size={14} />
                  </button>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
