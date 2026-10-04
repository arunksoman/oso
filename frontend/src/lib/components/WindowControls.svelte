<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import {
    Cancel01Icon,
    ArrowShrink02Icon,
    ArrowExpandIcon,
    ArrowShrinkIcon,
    Moon02Icon,
    Sun02Icon,
  } from '@hugeicons/core-free-icons';
  import { Application, Window } from '@wailsio/runtime';
  import { SaveSettings } from '$bindings/oso/app';
  import { appState } from '$lib/stores/appState.svelte';
  import type { Theme } from '$lib/stores/appState.svelte';

  let maximized = $state(false);

  async function checkMaximized() {
    maximized = await Window.IsMaximised();
  }

  // Check on mount & after toggle
  $effect(() => {
    checkMaximized();
  });

  async function toggleMaximize() {
    await Window.ToggleMaximise();
    await checkMaximized();
  }

  function applyTheme(theme: Theme) {
    appState.settings.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    // Saved so the theme survives a restart and reaches the settings window
    SaveSettings({ ...appState.settings }).catch((e) => {
      appState.notify(`Could not save the theme: ${e}`, 'error');
    });
  }

  const isDark = $derived(appState.settings.theme === 'night');
</script>

<div class="flex items-center gap-1">
  <!-- Theme toggle using daisyUI theme-controller -->
  <label class="swap swap-rotate btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content">
    <input
      type="checkbox"
      class="theme-controller"
      value="light"
      checked={!isDark}
      onchange={() => applyTheme(isDark ? 'light' : 'night')}
    />
    <span class="swap-off">
      <HugeiconsIcon icon={Moon02Icon} size={14} />
    </span>
    <span class="swap-on">
      <HugeiconsIcon icon={Sun02Icon} size={14} />
    </span>
  </label>

  <span class="w-px h-4 bg-base-300 mx-0.5"></span>

  <!-- Minimize -->
  <button
    class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
    onclick={() => Window.Minimise()}
    title="Minimize"
  >
    <HugeiconsIcon icon={ArrowShrink02Icon} size={14} />
  </button>

  <!-- Maximize / Restore -->
  <button
    class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
    onclick={toggleMaximize}
    title={maximized ? 'Restore' : 'Maximize'}
  >
    {#if maximized}
      <HugeiconsIcon icon={ArrowShrinkIcon} size={14} />
    {:else}
      <HugeiconsIcon icon={ArrowExpandIcon} size={14} />
    {/if}
  </button>

  <!-- Close -->
  <button
    class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-error"
    onclick={() => Application.Quit()}
    title="Close"
  >
    <HugeiconsIcon icon={Cancel01Icon} size={14} />
  </button>
</div>
