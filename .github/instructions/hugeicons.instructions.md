# Quick Start with Svelte (Free)

Get up and running with Hugeicons Free in your Svelte app. This guide covers prerequisites, installing the Svelte component and free icon package, and rendering your first icon.

## Video Tutorial

Watch this step-by-step guide on using Hugeicons in Svelte for free:

<div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', maxWidth: '100%', marginTop: '1rem', marginBottom: '2rem' }}>
  <iframe
    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
    src="https://www.youtube.com/embed/39rJBFFMDJA"
    title="How to use Hugeicons in Svelte for Free"
    frameBorder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowFullScreen
  />
</div>

## Prerequisites

Before you start, make sure you have:

- Node.js and npm (or Yarn / pnpm) installed
- A Svelte or SvelteKit app set up (Vite, SvelteKit, etc.)
- Basic familiarity with Svelte components and `<script>` blocks

## 1. Install Packages

First, install the Svelte component package:

```sh npm2yarn copy
npm install @hugeicons/svelte
```

Then, install the free icon pack:

```sh npm2yarn copy
npm install @hugeicons/core-free-icons
```

Our free package, `@hugeicons/core-free-icons`, includes 5,100+ icons in 1 style (Stroke Rounded only) you can use in any projects at no cost. For more styles, upgrade to Hugeicons Pro.

## 2. Basic Usage

Import the `HugeiconsIcon` component and any icon from the free package to get started.

```svelte copy
<script>
  import { HugeiconsIcon } from '@hugeicons/svelte'
  import { Notification03Icon } from '@hugeicons/core-free-icons'
</script>

<HugeiconsIcon
  icon={Notification03Icon}
  size={24}
  color="currentColor"
  strokeWidth={1.5}
/>
```

You can adjust the `size`, `color`, and `strokeWidth` props to match your design system.

## 3. Next steps

- Learn more about all available props on the [`HugeiconsIcon` wrapper](/integrations/svelte/wrapper)
- Explore interactive patterns on the [Examples with Svelte](/integrations/svelte/examples) page
- When you're ready for more icons and styles, check out [Hugeicons Pro with Svelte](/integrations/svelte/pro)


# Examples with Svelte

This page shows practical patterns for using `HugeiconsIcon` in common Svelte UI components.  
All examples assume you've already installed `@hugeicons/svelte` and either the free or Pro icon packages.

## Search bar with clear button

A search input that shows a clear button when text is entered:

```svelte copy
<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { SearchIcon, CancelCircleIcon } from "@hugeicons/core-free-icons";

  let searchValue = "";
</script>

<div>
  <input bind:value={searchValue} type="text" placeholder="Search..." />
  <button on:click={() => (searchValue.length > 0 ? (searchValue = "") : null)}>
    <HugeiconsIcon
      icon={SearchIcon}
      altIcon={CancelCircleIcon}
      showAlt={searchValue.length > 0}
      size={24}
      color="currentColor"
    />
  </button>
</div>
```

## Favorite toggle button with Pro Icons

A favorite toggle button that switches based on the state:

```svelte copy
<script>
  import { HugeiconsIcon } from '@hugeicons/svelte'
  import { FavouriteStrokeStandard } from '@hugeicons-pro/core-stroke-standard'
  import { FavouriteSolidStandard } from '@hugeicons-pro/core-solid-standard'

  let isFavorite = false
</script>

<button on:click={() => (isFavorite = !isFavorite)}>
  <HugeiconsIcon
    icon={FavouriteStrokeStandard}
    altIcon={FavouriteSolidStandard}
    showAlt={isFavorite}
    size={20}
  />
</button>
```

## Bottom navigation with active state

A navigation bar that uses different icon styles to indicate the active state:

```svelte copy
<script>
  import { HugeiconsIcon } from '@hugeicons/svelte'
  import {
    HomeIcon,
    SearchIcon,
    Notification03Icon,
    UserIcon
  } from '@hugeicons/core-free-icons'
  import {
    HomeIcon as HomeDuotone,
    SearchIcon as SearchDuotone,
    Notification03Icon as NotificationDuotone,
    UserIcon as UserDuotone
  } from '@hugeicons-pro/core-duotone-rounded'

  let activeTab = 'home'

  const navItems = [
    { id: 'home', solidIcon: HomeIcon, duotoneIcon: HomeDuotone },
    { id: 'search', solidIcon: SearchIcon, duotoneIcon: SearchDuotone },
    { id: 'notifications', solidIcon: Notification03Icon, duotoneIcon: NotificationDuotone },
    { id: 'profile', solidIcon: UserIcon, duotoneIcon: UserDuotone }
  ]
</script>

<nav>
  {#each navItems as item}
    <button
      on:click={() => (activeTab = item.id)}
      class:active={activeTab === item.id}
    >
      <HugeiconsIcon
        icon={item.solidIcon}
        altIcon={item.duotoneIcon}
        showAlt={activeTab === item.id}
        size={24}
      />
    </button>
  {/each}
</nav>
```

## Next steps

- For full prop details, see the [`HugeiconsIcon` wrapper](/integrations/svelte/wrapper) page  
- For setup instructions, visit [Quick Start with Svelte (Free)](/integrations/svelte/quick-start) or [Hugeicons Pro with Svelte](/integrations/svelte/pro)