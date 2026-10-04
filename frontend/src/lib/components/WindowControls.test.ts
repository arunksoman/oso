import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { Application, Window } from '@wailsio/runtime';
import { SaveSettings } from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import TitleBar from './TitleBar.svelte';
import WindowControls from './WindowControls.svelte';

describe('WindowControls', () => {
  it('minimises the window', async () => {
    render(WindowControls);
    await fireEvent.click(screen.getByTitle('Minimize'));
    expect(Window.Minimise).toHaveBeenCalledOnce();
  });

  it('quits the application', async () => {
    render(WindowControls);
    await fireEvent.click(screen.getByTitle('Close'));
    expect(Application.Quit).toHaveBeenCalledOnce();
  });

  it('toggles maximise and switches to the restore button', async () => {
    render(WindowControls);
    await vi.waitFor(() => expect(Window.IsMaximised).toHaveBeenCalled());
    vi.mocked(Window.IsMaximised).mockResolvedValue(true);

    await fireEvent.click(screen.getByTitle('Maximize'));

    expect(await screen.findByTitle('Restore')).toBeTruthy();
    expect(Window.ToggleMaximise).toHaveBeenCalledOnce();
  });

  it('starts with the restore button when already maximised', async () => {
    vi.mocked(Window.IsMaximised).mockResolvedValue(true);
    render(WindowControls);
    expect(await screen.findByTitle('Restore')).toBeTruthy();
  });

  it('switches between the night and light themes', async () => {
    render(WindowControls);
    const toggle = screen.getByRole<HTMLInputElement>('checkbox');
    expect(toggle.checked).toBe(false);

    await fireEvent.click(toggle);
    expect(appState.settings.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    await fireEvent.click(toggle);
    expect(appState.settings.theme).toBe('night');
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');
  });

  it('saves the theme so it reaches the settings window and survives a restart', async () => {
    render(WindowControls);

    await fireEvent.click(screen.getByRole('checkbox'));

    expect(SaveSettings).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light', pageSize: 1000 }));
  });

  it('reports when the theme cannot be saved', async () => {
    vi.mocked(SaveSettings).mockRejectedValue('disk full');
    render(WindowControls);

    await fireEvent.click(screen.getByRole('checkbox'));

    await vi.waitFor(() =>
      expect(appState.notification).toEqual({ message: 'Could not save the theme: disk full', type: 'error' }),
    );
  });
});

describe('TitleBar', () => {
  it('is a drag region that excludes the window controls', () => {
    const { container } = render(TitleBar);
    expect(container.querySelector('[style*="--wails-draggable: drag"]')).toBeTruthy();
    expect(screen.getByTitle('Close').closest('[style*="no-drag"]')).toBeTruthy();
  });
});
