<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import {
    BucketIcon,
    Refresh01Icon,
    Add01Icon,
    Download01Icon,
    Delete02Icon,
    CloudServerIcon,
    UnfoldMoreIcon,
    Tick01Icon,
    Settings01Icon,
  } from '@hugeicons/core-free-icons';
  import {
    ListBuckets,
    GetVersion,
    CreateBucket,
    GetAvailableUpdate,
    CheckForUpdates,
    SwitchProfile,
  } from '$bindings/oso/app';
  import { appState } from '$lib/stores/appState.svelte';
  import type { Bucket, ConnectionProfile } from '$lib/stores/appState.svelte';
  import { openSettings } from '$lib/stores/sync';

  let appVersion = $state('');
  let updateVersion = $state('');
  let showNewBucket = $state(false);
  let newBucketName = $state('');
  let creating = $state(false);
  let createError = $state('');
  let switchingId = $state('');

  const activeProfile = $derived(appState.profiles.find((p) => p.id === appState.activeProfileId));

  /** Close the profile menu, which stays open while something inside has focus */
  function closeMenu() {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  async function switchProfile(profile: ConnectionProfile) {
    closeMenu();
    if (profile.id === appState.activeProfileId || switchingId) return;
    switchingId = profile.id;
    try {
      await SwitchProfile(profile.id);
      appState.applyConnection(profile.id, true);
      appState.notify(`Connected to "${profile.name}"`, 'success');
    } catch (e) {
      appState.notify(String(e), 'error');
    } finally {
      switchingId = '';
    }
  }

  function manageConnections() {
    closeMenu();
    void openSettings('connections');
  }

  /** Svelte action: focus element on mount */
  function focus(node: HTMLElement) { node.focus(); }

  async function loadBuckets() {
    appState.bucketsLoading = true;
    try {
      const buckets = await ListBuckets();
      appState.buckets = buckets ?? [];
    } catch (e) {
      appState.notify(`Failed to load buckets: ${e}`, 'error');
    } finally {
      appState.bucketsLoading = false;
    }
  }

  function selectBucket(bucket: Bucket) {
    if (appState.currentBucket === bucket.name) return;
    appState.currentBucket = bucket.name;
    appState.currentPrefix = '';
    appState.objects = [];
    appState.continuationToken = '';
    appState.hasMore = false;
    appState.selectedKeys = new Set();
  }

  // Loads on mount and again whenever the connection or the bucket set changes
  $effect(() => {
    void appState.bucketsTrigger;
    untrack(() => void loadBuckets());
  });

  onMount(() => {
    GetVersion().then((v) => { appVersion = v; });
    // Silent startup check; being offline or rate limited is not worth a toast
    GetAvailableUpdate()
      .then((v) => { updateVersion = v; })
      .catch(() => {});
  });

  async function handleCreateBucket() {
    const name = newBucketName.trim();
    if (!name) return;

    // Client-side validation
    if (name.length < 3 || name.length > 63) {
      createError = 'Name must be between 3 and 63 characters';
      return;
    }
    if (!/^[a-z0-9][a-z0-9.\-]*[a-z0-9]$/.test(name)) {
      createError = 'Only lowercase letters, numbers, hyphens, dots. Must start/end with letter or number';
      return;
    }
    if (name.includes('..')) {
      createError = 'Must not contain consecutive dots';
      return;
    }

    creating = true;
    createError = '';
    try {
      await CreateBucket(name);
      appState.notify(`Bucket "${name}" created`, 'success');
      showNewBucket = false;
      newBucketName = '';
      await loadBuckets();
    } catch (e) {
      // Server errors go to toast
      appState.notify(String(e), 'error');
    } finally {
      creating = false;
    }
  }

  function cancelCreate() {
    showNewBucket = false;
    newBucketName = '';
    createError = '';
  }
</script>

<aside class="w-56 bg-base-200 flex flex-col shrink-0 border-r border-base-300">
  <!-- Connection switcher -->
  <div class="dropdown w-full border-b border-base-300">
    <div
      tabindex="0"
      role="button"
      class="flex items-center gap-2.5 w-full px-3 py-2 cursor-pointer hover:bg-base-300 transition-colors"
      title="Switch connection"
    >
      <span class="shrink-0 text-primary">
        {#if switchingId}
          <span class="loading loading-spinner loading-xs"></span>
        {:else}
          <HugeiconsIcon icon={CloudServerIcon} size={16} />
        {/if}
      </span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold truncate leading-tight">{activeProfile?.name ?? 'Connection'}</p>
        <p class="text-xs font-mono text-base-content/40 truncate leading-tight">
          {activeProfile?.endpoint ?? 'Not saved as a profile'}
        </p>
      </div>
      <span class="shrink-0 text-base-content/40">
        <HugeiconsIcon icon={UnfoldMoreIcon} size={14} />
      </span>
    </div>
    <ul
      tabindex="-1"
      class="dropdown-content menu bg-base-200 border border-base-300 rounded-box shadow-lg z-50 w-64 p-1 mt-1 ml-1 max-h-80 flex-nowrap overflow-y-auto"
    >
      {#each appState.profiles as profile (profile.id)}
        {@const active = profile.id === appState.activeProfileId}
        <li>
          <button class="flex items-center gap-2 text-sm" onclick={() => switchProfile(profile)} aria-current={active}>
            <span class="w-3.5 shrink-0 text-success">
              {#if active}<HugeiconsIcon icon={Tick01Icon} size={14} />{/if}
            </span>
            <span class="flex-1 min-w-0">
              <span class="block truncate">{profile.name}</span>
              <span class="block truncate text-xs font-mono text-base-content/40">{profile.endpoint}</span>
            </span>
          </button>
        </li>
      {/each}
      {#if appState.profiles.length > 0}
        <li class="h-px bg-base-300 my-1"></li>
      {/if}
      <li>
        <button class="flex items-center gap-2 text-sm" onclick={manageConnections}>
          <HugeiconsIcon icon={Settings01Icon} size={14} class="text-base-content/60" />
          Manage connections
        </button>
      </li>
    </ul>
  </div>

  <!-- Header -->
  <div class="flex items-center justify-between px-3 py-2.5 border-b border-base-300">
    <div class="flex items-center gap-2 text-base-content/50">
      <HugeiconsIcon icon={BucketIcon} size={13} />
      <span class="text-xs font-bold uppercase tracking-widest">Buckets</span>
    </div>
    <div class="flex items-center gap-0.5">
      <button
        class="btn btn-ghost btn-xs p-0.5 h-auto min-h-0"
        onclick={() => { showNewBucket = true; createError = ''; }}
        title="Create new bucket"
      >
        <HugeiconsIcon icon={Add01Icon} size={13} />
      </button>
      <button
        class="btn btn-ghost btn-xs p-0.5 h-auto min-h-0"
        onclick={loadBuckets}
        disabled={appState.bucketsLoading}
        title="Refresh bucket list"
      >
        <span class={appState.bucketsLoading ? 'animate-spin' : ''}>
          <HugeiconsIcon icon={Refresh01Icon} size={13} />
        </span>
      </button>
    </div>
  </div>

  <!-- New bucket input -->
  {#if showNewBucket}
    <div class="px-3 py-2 border-b border-base-300 flex flex-col gap-1.5">
      <input
        type="text"
        class="input input-bordered input-xs bg-base-100 w-full font-mono text-xs"
        placeholder="new-bucket-name"
        bind:value={newBucketName}
        use:focus
        onkeydown={(e) => {
          if (e.key === 'Enter') void handleCreateBucket();
          if (e.key === 'Escape') cancelCreate();
        }}
      />
      {#if createError}
        <p class="text-xs text-error leading-tight">{createError}</p>
      {/if}
      <div class="flex gap-1.5">
        <button
          class="btn btn-primary btn-xs flex-1"
          onclick={handleCreateBucket}
          disabled={creating || !newBucketName.trim()}
        >
          {#if creating}<span class="loading loading-spinner loading-xs"></span>{:else}Create{/if}
        </button>
        <button class="btn btn-ghost btn-xs" onclick={cancelCreate}>Cancel</button>
      </div>
    </div>
  {/if}

  <!-- Bucket list -->
  <div class="flex-1 overflow-y-auto py-1">
    {#if appState.bucketsLoading && appState.buckets.length === 0}
      <div class="flex justify-center py-8">
        <span class="loading loading-spinner loading-xs text-primary"></span>
      </div>
    {:else if appState.buckets.length === 0}
      <p class="text-xs text-base-content/30 text-center py-6 px-4">No buckets found</p>
    {:else}
      {#each appState.buckets as bucket (bucket.name)}
        {@const current = appState.currentBucket === bucket.name}
        <div
          class="flex items-center transition-colors group"
          class:bg-primary={current}
          class:text-primary-content={current}
          class:hover:bg-base-300={!current}
        >
          <button
            class="flex items-center gap-2.5 flex-1 min-w-0 pl-3 pr-1 py-1.5 text-left"
            onclick={() => selectBucket(bucket)}
          >
            <span class="shrink-0 flex items-center leading-none {current ? 'text-primary-content/70' : 'text-warning/60 group-hover:text-warning/80'}">
              <HugeiconsIcon icon={BucketIcon} size={16} />
            </span>
            <span class="text-sm font-medium truncate leading-none">{bucket.name}</span>
          </button>
          <button
            class="btn btn-ghost btn-xs p-0.5 h-auto min-h-0 mr-1.5 shrink-0 opacity-0 group-hover:opacity-70 focus-visible:opacity-100 hover:opacity-100! hover:text-error"
            onclick={() => { appState.deleteBucketTarget = bucket.name; }}
            title="Delete bucket {bucket.name}"
          >
            <HugeiconsIcon icon={Delete02Icon} size={13} />
          </button>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Footer -->
  <div class="px-3 py-2 border-t border-base-300 flex flex-col items-center gap-1">
    {#if appState.currentBucket}
      <p class="text-xs font-mono text-base-content/25 truncate w-full text-center" title="s3://{appState.currentBucket}">
        s3://{appState.currentBucket}
      </p>
    {/if}
    {#if updateVersion}
      <button class="btn btn-primary btn-xs w-full" onclick={() => CheckForUpdates()}>
        <HugeiconsIcon icon={Download01Icon} size={13} />
        Update to v{updateVersion}
      </button>
    {/if}
    {#if appVersion}
      <button
        class="text-xs text-base-content/40 hover:text-base-content/70 cursor-pointer"
        onclick={() => CheckForUpdates()}
        title="Check for updates"
      >
        v{appVersion}
      </button>
    {/if}
  </div>
</aside>
