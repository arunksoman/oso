<script lang="ts">
  import { onMount } from 'svelte';
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import {
    Settings01Icon,
    CloudServerIcon,
    InformationCircleIcon,
    Cancel01Icon,
  } from '@hugeicons/core-free-icons';
  import { Events, Window } from '@wailsio/runtime';
  import { GetVersion } from '$bindings/oso/app';
  import { listenForSharedState, loadSharedState } from '$lib/stores/sync';
  import type { SettingsSection } from '$lib/stores/sync';
  import Toast from '$lib/components/Toast.svelte';
  import GeneralSection from './GeneralSection.svelte';
  import ConnectionsSection from './ConnectionsSection.svelte';
  import AboutSection from './AboutSection.svelte';

  const sections = [
    { id: 'general', label: 'General', hint: 'Appearance, downloads and the file list', icon: Settings01Icon },
    { id: 'connections', label: 'Connections', hint: 'Saved S3 accounts and the one in use', icon: CloudServerIcon },
    { id: 'about', label: 'About', hint: 'Version and updates', icon: InformationCircleIcon },
  ] as const;

  function toSection(value: string | null): SettingsSection {
    return sections.find((s) => s.id === value)?.id ?? 'general';
  }

  let section = $state<SettingsSection>(toSection(new URLSearchParams(window.location.search).get('section')));
  let appVersion = $state('');
  let ready = $state(false);

  const current = $derived(sections.find((s) => s.id === section)!);

  onMount(() => {
    loadSharedState()
      .catch((e) => console.error('Startup error:', e))
      .finally(() => { ready = true; });
    GetVersion()
      .then((v) => { appVersion = v; })
      .catch(() => {});

    const stopSync = listenForSharedState();
    // The explorer asks an already open window to show a section
    const stopNavigate = Events.On('settings:navigate', ({ data }) => {
      section = toSection(data);
    });
    return () => {
      stopSync();
      stopNavigate();
    };
  });

  function close() {
    void Window.Close();
    // In server mode the settings are a browser window opened by the explorer
    if (window.opener) window.close();
  }
</script>

<div class="flex h-screen w-screen overflow-hidden bg-base-100 text-base-content">
  <!-- Section list -->
  <aside class="w-52 bg-base-200 flex flex-col shrink-0 border-r border-base-300" style="--wails-draggable: drag">
    <div class="flex items-center gap-2 px-3 py-2.5 border-b border-base-300 text-base-content/50">
      <HugeiconsIcon icon={Settings01Icon} size={13} />
      <span class="text-xs font-bold uppercase tracking-widest">Settings</span>
    </div>

    <nav class="flex-1 overflow-y-auto py-1" style="--wails-draggable: no-drag" aria-label="Settings sections">
      {#each sections as item (item.id)}
        {@const active = section === item.id}
        <button
          class="flex items-center gap-2.5 w-full px-3 py-1.5 text-left transition-colors group"
          class:bg-primary={active}
          class:text-primary-content={active}
          class:hover:bg-base-300={!active}
          aria-current={active ? 'page' : undefined}
          onclick={() => { section = item.id; }}
        >
          <span class="shrink-0 flex items-center leading-none {active ? 'text-primary-content/70' : 'text-base-content/50 group-hover:text-base-content/80'}">
            <HugeiconsIcon icon={item.icon} size={16} />
          </span>
          <span class="text-sm font-medium truncate leading-none">{item.label}</span>
        </button>
      {/each}
    </nav>

    {#if appVersion}
      <div class="px-3 py-2 border-t border-base-300 text-center text-xs text-base-content/40">
        Oso v{appVersion}
      </div>
    {/if}
  </aside>

  <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
    <!-- Title bar -->
    <div
      class="flex items-center justify-between gap-3 px-5 py-2 border-b border-base-300/60 bg-base-100 shrink-0"
      style="--wails-draggable: drag"
    >
      <div class="min-w-0">
        <h1 class="text-sm font-semibold leading-tight">{current.label}</h1>
        <p class="text-xs text-base-content/40 truncate">{current.hint}</p>
      </div>
      <div style="--wails-draggable: no-drag">
        <button
          class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-error"
          onclick={close}
          title="Close"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </button>
      </div>
    </div>

    {#if !ready}
      <div class="flex-1 flex items-center justify-center">
        <span class="loading loading-spinner loading-md text-primary/40"></span>
      </div>
    {:else if section === 'general'}
      <GeneralSection />
    {:else if section === 'connections'}
      <ConnectionsSection />
    {:else}
      <AboutSection />
    {/if}
  </div>
</div>

<Toast />
