// State shared between the explorer and the settings window. Each window has
// its own copy of appState; the backend broadcasts every change as an event.

import { Events } from '@wailsio/runtime';
import {
  GetActiveProfileID,
  GetSettings,
  IsConnected,
  ListProfiles,
  OpenSettingsWindow,
} from '$bindings/oso/app';
import { appState } from './appState.svelte';

export type SettingsSection = 'general' | 'connections' | 'about';

export async function refreshProfiles() {
  appState.profiles = (await ListProfiles()) ?? [];
}

/** Load settings, profiles and the connection state from the backend */
export async function loadSharedState() {
  const [settings, connected, profiles, activeId] = await Promise.all([
    GetSettings(),
    IsConnected(),
    ListProfiles(),
    GetActiveProfileID(),
  ]);
  if (settings) appState.applySettings(settings);
  appState.profiles = profiles ?? [];
  appState.activeProfileId = activeId ?? '';
  appState.connected = !!connected;
}

/** Follow changes made by any window; returns the function that stops listening */
export function listenForSharedState() {
  const stop = [
    Events.On('settings:changed', ({ data }) => {
      appState.applySettings(data);
    }),
    Events.On('profiles:changed', ({ data }) => {
      appState.applyConnection(data.activeId, data.connected);
      refreshProfiles().catch(() => {});
    }),
  ];
  return () => stop.forEach((off) => off());
}

/** Show the settings window; server mode has none and opens the page instead */
export async function openSettings(section: SettingsSection | '' = '') {
  const opened = await OpenSettingsWindow(section).catch(() => false);
  if (!opened) {
    window.open(section ? `/settings?section=${section}` : '/settings', 'oso-settings');
  }
}
