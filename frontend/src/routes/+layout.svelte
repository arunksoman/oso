<script lang="ts">
  import '../app.css';
  import type { Pathname } from '$app/types';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { locales, localizeHref } from '$lib/paraglide/runtime';
  import { appState } from '$lib/stores/appState.svelte';

  let { children } = $props();

  $effect(() => {
    document.documentElement.setAttribute('data-theme', appState.settings.theme);
  });

  // Auto-scale font-size for high-resolution screens.
  // Baseline: 1080px screen height = 16px (browser default).
  // Scales up proportionally for larger screens, never shrinks below 16px.
  function applyAutoScale() {
    const baseHeight = 1080;
    const baseFontSize = 16;
    const screenHeight = window.screen.availHeight;
    const scaled = baseFontSize * Math.max(screenHeight / baseHeight, 1);
    const fontSize = Math.min(scaled, 22); // cap at 22px
    document.documentElement.style.fontSize = `${fontSize}px`;
  }

  $effect(() => {
    applyAutoScale();
    window.addEventListener('resize', applyAutoScale);
    return () => window.removeEventListener('resize', applyAutoScale);
  });
</script>

{@render children()}

<!-- Hidden locale links for paraglide SSG crawling -->
<div style="display:none" aria-hidden="true">
  {#each locales as locale (locale)}
    <a href={resolve(localizeHref(page.url.pathname, { locale }) as Pathname)}>{locale}</a>
  {/each}
</div>
