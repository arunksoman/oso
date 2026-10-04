<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import {
    Add01Icon,
    CloudServerIcon,
    Edit01Icon,
    Delete02Icon,
    Tick01Icon,
    WifiError02Icon,
    ViewIcon,
    ViewOffIcon,
  } from '@hugeicons/core-free-icons';
  import {
    SaveProfile,
    DeleteProfile,
    SwitchProfile,
    TestConnection,
    Disconnect,
  } from '$bindings/oso/app';
  import { appState } from '$lib/stores/appState.svelte';
  import type { ConnectionProfile } from '$lib/stores/appState.svelte';
  import { refreshProfiles } from '$lib/stores/sync';

  const blank: ConnectionProfile = {
    id: '',
    name: '',
    endpoint: '',
    accessKey: '',
    secretKey: '',
    region: 'us-east-1',
    readOnly: false,
  };

  // The profile in the editor; an empty id is a new connection
  let draft = $state<ConnectionProfile | null>(null);
  let showSecret = $state(false);
  let saving = $state(false);
  let testing = $state(false);
  let testResult = $state<'ok' | null>(null);
  let formError = $state('');

  let busyId = $state('');
  let confirmDeleteId = $state('');

  function edit(profile: ConnectionProfile) {
    draft = { ...profile };
    showSecret = false;
    testResult = null;
    formError = '';
    confirmDeleteId = '';
  }

  function closeEditor() {
    draft = null;
  }

  function validate(profile: ConnectionProfile) {
    if (!profile.endpoint.trim() || !profile.accessKey.trim() || !profile.secretKey.trim()) {
      formError = 'Endpoint, Access Key and Secret Key are required';
      return false;
    }
    formError = '';
    return true;
  }

  async function test() {
    if (!draft || !validate(draft)) return;
    testing = true;
    testResult = null;
    try {
      await TestConnection({
        endpoint: draft.endpoint.trim(),
        accessKey: draft.accessKey.trim(),
        secretKey: draft.secretKey,
        region: draft.region.trim(),
      });
      testResult = 'ok';
    } catch (e) {
      formError = String(e);
    } finally {
      testing = false;
    }
  }

  async function save() {
    if (!draft || !validate(draft)) return;
    saving = true;
    testResult = null;
    try {
      const saved = await SaveProfile(draft);
      await refreshProfiles();
      appState.notify(`Connection "${saved?.name ?? draft.name}" saved`, 'success');
      draft = null;
    } catch (e) {
      formError = String(e);
    } finally {
      saving = false;
    }
  }

  async function connect(profile: ConnectionProfile) {
    busyId = profile.id;
    try {
      await SwitchProfile(profile.id);
      appState.applyConnection(profile.id, true);
      appState.notify(`Connected to "${profile.name}"`, 'success');
    } catch (e) {
      appState.notify(String(e), 'error');
    } finally {
      busyId = '';
    }
  }

  async function disconnect() {
    try {
      await Disconnect();
      appState.applyConnection('', false);
    } catch (e) {
      appState.notify(String(e), 'error');
    }
  }

  async function remove(profile: ConnectionProfile) {
    busyId = profile.id;
    try {
      await DeleteProfile(profile.id);
      if (profile.id === appState.activeProfileId) appState.applyConnection('', false);
      if (draft?.id === profile.id) draft = null;
      await refreshProfiles();
      appState.notify(`Connection "${profile.name}" deleted`, 'success');
    } catch (e) {
      appState.notify(String(e), 'error');
    } finally {
      busyId = '';
      confirmDeleteId = '';
    }
  }
</script>

<div class="flex-1 overflow-y-auto px-5 py-5">
  <div class="flex flex-col gap-5 max-w-xl">
    <section>
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs font-bold uppercase tracking-widest text-base-content/30">Saved connections</p>
        <button class="btn btn-outline btn-xs gap-1.5" onclick={() => edit(blank)}>
          <HugeiconsIcon icon={Add01Icon} size={13} />
          New connection
        </button>
      </div>

      {#if appState.profiles.length === 0}
        <p class="text-sm text-base-content/40 border border-dashed border-base-300 px-4 py-6 text-center">
          No saved connections yet
        </p>
      {:else}
        <ul class="flex flex-col border border-base-300 divide-y divide-base-300">
          {#each appState.profiles as profile (profile.id)}
            {@const active = profile.id === appState.activeProfileId}
            <li class="flex items-center gap-3 px-3 py-2.5 bg-base-200" aria-label={profile.name}>
              <span class="shrink-0 {active ? 'text-primary' : 'text-base-content/40'}">
                <HugeiconsIcon icon={CloudServerIcon} size={18} />
              </span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium truncate">{profile.name}</span>
                  {#if active}
                    <span class="flex items-center gap-1 text-xs text-success shrink-0">
                      <HugeiconsIcon icon={Tick01Icon} size={12} />
                      Active
                    </span>
                  {/if}
                </div>
                <p class="text-xs font-mono text-base-content/40 truncate">{profile.endpoint} · {profile.region}</p>
                {#if profile.readOnly}
                  <p class="text-xs text-base-content/30">Set through S3_* environment variables</p>
                {/if}
              </div>

              {#if confirmDeleteId === profile.id}
                <div class="flex items-center gap-1 shrink-0">
                  <span class="text-xs text-error mr-1">Delete?</span>
                  <button class="btn btn-error btn-xs" onclick={() => remove(profile)} disabled={busyId === profile.id}>
                    Delete
                  </button>
                  <button class="btn btn-ghost btn-xs" onclick={() => { confirmDeleteId = ''; }}>Keep</button>
                </div>
              {:else}
                <div class="flex items-center gap-0.5 shrink-0">
                  {#if active}
                    <button class="btn btn-ghost btn-xs" onclick={disconnect}>Disconnect</button>
                  {:else}
                    <button class="btn btn-primary btn-xs gap-1.5" onclick={() => connect(profile)} disabled={busyId !== ''}>
                      {#if busyId === profile.id}<span class="loading loading-spinner loading-xs"></span>{/if}
                      Connect
                    </button>
                  {/if}
                  {#if !profile.readOnly}
                    <button
                      class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-base-content"
                      onclick={() => edit(profile)}
                      title="Edit {profile.name}"
                    >
                      <HugeiconsIcon icon={Edit01Icon} size={14} />
                    </button>
                    <button
                      class="btn btn-ghost btn-xs p-1 h-auto min-h-0 text-base-content/50 hover:text-error"
                      onclick={() => { confirmDeleteId = profile.id; }}
                      title="Delete {profile.name}"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={14} />
                    </button>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if draft}
      <form
        class="border-t border-base-300 pt-4 flex flex-col gap-4"
        onsubmit={(e) => { e.preventDefault(); void save(); }}
      >
        <p class="text-xs font-bold uppercase tracking-widest text-base-content/30">
          {draft.id ? 'Edit connection' : 'New connection'}
        </p>

        <div class="flex flex-col gap-1">
          <label for="profile-name" class="text-xs font-bold uppercase tracking-widest text-base-content/30">Name</label>
          <input id="profile-name" type="text" class="input input-bordered input-sm bg-base-100 w-full" placeholder="Production" bind:value={draft.name} />
        </div>

        <div class="flex flex-col gap-1">
          <label for="profile-endpoint" class="text-xs font-bold uppercase tracking-widest text-base-content/30">Endpoint URL</label>
          <input id="profile-endpoint" type="url" class="input input-bordered input-sm bg-base-100 w-full font-mono" placeholder="https://s3.amazonaws.com" bind:value={draft.endpoint} />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="profile-access-key" class="text-xs font-bold uppercase tracking-widest text-base-content/30">Access Key</label>
            <input id="profile-access-key" type="text" class="input input-bordered input-sm bg-base-100 w-full font-mono text-xs" autocomplete="off" spellcheck="false" bind:value={draft.accessKey} />
          </div>
          <div class="flex flex-col gap-1">
            <label for="profile-secret-key" class="text-xs font-bold uppercase tracking-widest text-base-content/30">Secret Key</label>
            <div class="flex gap-1">
              <input id="profile-secret-key" type={showSecret ? 'text' : 'password'} class="input input-bordered input-sm bg-base-100 w-full font-mono text-xs" autocomplete="off" bind:value={draft.secretKey} />
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-square text-base-content/50"
                onclick={() => { showSecret = !showSecret; }}
                title={showSecret ? 'Hide secret key' : 'Show secret key'}
              >
                <HugeiconsIcon icon={showSecret ? ViewOffIcon : ViewIcon} size={14} />
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label for="profile-region" class="text-xs font-bold uppercase tracking-widest text-base-content/30">Region</label>
          <input id="profile-region" type="text" class="input input-bordered input-sm bg-base-100 w-full" placeholder="us-east-1" bind:value={draft.region} />
        </div>

        {#if formError}
          <div class="flex items-start gap-2 bg-error/10 border border-error/20 text-error p-3 text-xs">
            <HugeiconsIcon icon={WifiError02Icon} size={14} class="shrink-0 mt-0.5" />
            <span class="wrap-break-word min-w-0">{formError}</span>
          </div>
        {:else if testResult === 'ok'}
          <div class="flex items-center gap-2 bg-success/10 border border-success/20 text-success p-3 text-xs">
            <HugeiconsIcon icon={Tick01Icon} size={14} />
            <span>Connection works</span>
          </div>
        {/if}

        <div class="flex justify-between gap-2 pt-3 border-t border-base-300">
          <button type="button" class="btn btn-outline btn-sm gap-2" onclick={test} disabled={testing || saving}>
            {#if testing}<span class="loading loading-spinner loading-xs"></span>{/if}
            Test connection
          </button>
          <div class="flex gap-2">
            <button type="button" class="btn btn-ghost btn-sm" onclick={closeEditor} disabled={saving}>Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm gap-2" disabled={saving || testing}>
              {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
              Save
            </button>
          </div>
        </div>
      </form>
    {/if}
  </div>
</div>
