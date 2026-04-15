<script lang="ts">
  import '../app.css';
  import type { Pathname } from '$app/types';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { locales, localizeHref } from '$lib/paraglide/runtime';

  let { children } = $props();
</script>

{@render children()}

<!-- Hidden locale links for paraglide SSG crawling -->
<div style="display:none" aria-hidden="true">
  {#each locales as locale (locale)}
    <a href={resolve(localizeHref(page.url.pathname, { locale }) as Pathname)}>{locale}</a>
  {/each}
</div>
