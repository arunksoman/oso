<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import { Moon02Icon, Sun02Icon } from '@hugeicons/core-free-icons';
  import { SaveSettings, OpenDirectoryDialog } from '$bindings/oso/app';
  import { appState } from '$lib/stores/appState.svelte';
  import type { AppSettings, Theme } from '$lib/stores/appState.svelte';

  const themes: { id: Theme; label: string; icon: typeof Moon02Icon }[] = [
    { id: 'night', label: 'Night', icon: Moon02Icon },
    { id: 'light', label: 'Light', icon: Sun02Icon },
  ];

  let settings = $state<AppSettings>({ ...appState.settings });
  let saving = $state(false);

  // Start again from the saved settings whenever any window changes them
  $effect(() => {
    settings = { ...appState.settings };
  });

  const dirty = $derived(
    (Object.keys(settings) as (keyof AppSettings)[]).some((key) => settings[key] !== appState.settings[key]),
  );

  async function save() {
    saving = true;
    try {
      await SaveSettings(settings);
      appState.applySettings(settings);
      appState.notify('Settings saved', 'success');
    } catch (e) {
      appState.notify(`Save failed: ${e}`, 'error');
    } finally {
      saving = false;
    }
  }

  function reset() {
    settings = { ...appState.settings };
  }

  async function browse() {
    try {
      const path = await OpenDirectoryDialog();
      if (path) settings.defaultDownloadPath = path;
    } catch (e) {
      appState.notify(`Could not open the folder picker: ${e}`, 'error');
    }
  }
</script>

<div class="flex-1 overflow-y-auto px-5 py-5">
  <div class="flex flex-col gap-5 max-w-xl">
    <!-- Appearance -->
    <section>
      <p class="text-xs font-bold uppercase tracking-widest text-base-content/30 mb-3">Appearance</p>
      <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Theme">
        {#each themes as theme (theme.id)}
          {@const active = settings.theme === theme.id}
          <button
            role="radio"
            aria-checked={active}
            class="flex items-center gap-2.5 px-3 py-2.5 border text-left transition-colors {active ? 'border-primary bg-primary/10 text-primary' : 'border-base-300 bg-base-200 text-base-content/60 hover:text-base-content'}"
            onclick={() => { settings.theme = theme.id; }}
          >
            <HugeiconsIcon icon={theme.icon} size={16} />
            <span class="text-sm font-medium">{theme.label}</span>
          </button>
        {/each}
      </div>
    </section>

    <!-- Downloads -->
    <section class="border-t border-base-300 pt-4">
      <p class="text-xs font-bold uppercase tracking-widest text-base-content/30 mb-3">Downloads</p>
      <div class="flex gap-2 mb-3">
        <input
          type="text"
          class="input input-bordered input-sm bg-base-100 flex-1 font-mono text-xs"
          placeholder="Default download folder"
          bind:value={settings.defaultDownloadPath}
        />
        <button class="btn btn-outline btn-sm" onclick={browse}>Browse</button>
      </div>
      <label class="flex items-center gap-2.5 cursor-pointer select-none">
        <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" bind:checked={settings.askBeforeDownload} />
        <span class="text-sm">Ask for save location before each download</span>
      </label>
    </section>

    <!-- Display -->
    <section class="border-t border-base-300 pt-4">
      <p class="text-xs font-bold uppercase tracking-widest text-base-content/30 mb-3">Display</p>
      <label class="flex items-center gap-2.5 cursor-pointer select-none mb-4">
        <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" bind:checked={settings.showFileDetails} />
        <span class="text-sm">Show file details (size, type, modified)</span>
      </label>
      <div class="flex flex-col gap-1.5">
        <label for="settings-page-size" class="text-sm">Items per page</label>
        <select id="settings-page-size" class="select select-bordered select-sm bg-base-100 w-36" bind:value={settings.pageSize}>
          <option value={100}>100</option>
          <option value={250}>250</option>
          <option value={500}>500</option>
          <option value={1000}>1000</option>
        </select>
        <p class="text-xs text-base-content/40">
          Number of items fetched per scroll page. S3 caps each API request at 1000 — larger values mean fewer round-trips but slower initial loads in big buckets.
        </p>
      </div>
    </section>
  </div>
</div>

<div class="flex items-center justify-between gap-2 px-5 py-3 border-t border-base-300 bg-base-200 shrink-0">
  <span class="text-xs text-base-content/40">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
  <div class="flex gap-2">
    <button class="btn btn-ghost btn-sm" onclick={reset} disabled={!dirty || saving}>Reset</button>
    <button class="btn btn-primary btn-sm gap-2" onclick={save} disabled={!dirty || saving}>
      {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
      Save
    </button>
  </div>
</div>
