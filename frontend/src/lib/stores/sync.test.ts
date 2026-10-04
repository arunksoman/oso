import { describe, expect, it, vi } from 'vitest';
import { Events } from '@wailsio/runtime';
import {
  GetActiveProfileID,
  GetSettings,
  IsConnected,
  ListProfiles,
  OpenSettingsWindow,
} from '$bindings/oso/app';
import { appState } from './appState.svelte';
import { listenForSharedState, loadSharedState, openSettings, refreshProfiles } from './sync';
import { emitEvent, file, profile } from '../../test/helpers';

describe('loadSharedState', () => {
  it('loads settings, profiles and the connection', async () => {
    vi.mocked(GetSettings).mockResolvedValue({
      defaultDownloadPath: '/downloads',
      askBeforeDownload: false,
      showFileDetails: true,
      pageSize: 500,
      theme: 'light',
    });
    vi.mocked(IsConnected).mockResolvedValue(true);
    vi.mocked(ListProfiles).mockResolvedValue([profile('work')]);
    vi.mocked(GetActiveProfileID).mockResolvedValue('work');

    await loadSharedState();

    expect(appState.settings.theme).toBe('light');
    expect(appState.settings.pageSize).toBe(500);
    expect(appState.connected).toBe(true);
    expect(appState.activeProfileId).toBe('work');
    expect(appState.profiles).toHaveLength(1);
  });

  it('keeps the defaults when the backend returns nothing', async () => {
    await loadSharedState();

    expect(appState.settings.pageSize).toBe(1000);
    expect(appState.connected).toBe(false);
    expect(appState.activeProfileId).toBe('');
    expect(appState.profiles).toEqual([]);
  });
});

describe('refreshProfiles', () => {
  it('treats a missing list as empty', async () => {
    appState.profiles = [profile('old')];
    vi.mocked(ListProfiles).mockResolvedValue(null as never);

    await refreshProfiles();

    expect(appState.profiles).toEqual([]);
  });
});

describe('listenForSharedState', () => {
  it('applies settings saved by another window', () => {
    listenForSharedState();

    emitEvent('settings:changed', { pageSize: 250, theme: 'light' });

    expect(appState.settings.pageSize).toBe(250);
    expect(appState.settings.theme).toBe('light');
  });

  it('follows a connection change and reloads the profiles', async () => {
    appState.connected = true;
    appState.activeProfileId = 'work';
    appState.currentBucket = 'bucket';
    appState.objects = [file('a.txt')];
    vi.mocked(ListProfiles).mockResolvedValue([profile('home')]);
    listenForSharedState();

    emitEvent('profiles:changed', { activeId: 'home', connected: true });

    expect(appState.activeProfileId).toBe('home');
    expect(appState.currentBucket).toBeNull();
    expect(appState.objects).toEqual([]);
    expect(appState.bucketsTrigger).toBe(1);
    await vi.waitFor(() => expect(appState.profiles.map((p) => p.id)).toEqual(['home']));
  });

  it('survives a failing profile reload', async () => {
    vi.mocked(ListProfiles).mockRejectedValue('backend gone');
    listenForSharedState();

    emitEvent('profiles:changed', { activeId: '', connected: false });

    await vi.waitFor(() => expect(ListProfiles).toHaveBeenCalled());
    expect(appState.connected).toBe(false);
  });

  it('removes both listeners when stopped', () => {
    const stop = listenForSharedState();
    const removers = vi.mocked(Events.On).mock.results.map((result) => result.value);

    stop();

    expect(removers).toHaveLength(2);
    for (const remove of removers) expect(remove).toHaveBeenCalledOnce();
  });
});

describe('openSettings', () => {
  it('asks the backend for the settings window', async () => {
    vi.mocked(OpenSettingsWindow).mockResolvedValue(true);

    await openSettings('connections');

    expect(OpenSettingsWindow).toHaveBeenCalledWith('connections');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('opens the settings page when there are no native windows', async () => {
    vi.mocked(OpenSettingsWindow).mockResolvedValue(false);

    await openSettings('connections');

    expect(window.open).toHaveBeenCalledWith('/settings?section=connections', 'oso-settings');
  });

  it('opens the settings page when the backend call fails', async () => {
    vi.mocked(OpenSettingsWindow).mockRejectedValue('no runtime');

    await openSettings();

    expect(window.open).toHaveBeenCalledWith('/settings', 'oso-settings');
  });
});
