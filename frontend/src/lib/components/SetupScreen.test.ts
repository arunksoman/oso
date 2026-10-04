import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { Connect, GetActiveProfileID, SwitchProfile } from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import { deferred, profile } from '../../test/helpers';
import SetupScreen from './SetupScreen.svelte';

async function fill(values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    await fireEvent.input(screen.getByLabelText(label), { target: { value } });
  }
}

const valid = {
  'Endpoint URL': '  http://localhost:9000 ',
  'Access Key': ' osodev ',
  'Secret Key': ' osodevpass ',
};

describe('SetupScreen', () => {
  it('requires endpoint and both keys', async () => {
    render(SetupScreen);

    await fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(screen.getByText('Endpoint, Access Key and Secret Key are required')).toBeTruthy();
    expect(Connect).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only credentials', async () => {
    render(SetupScreen);
    await fill({ 'Endpoint URL': 'http://localhost:9000', 'Access Key': 'key', 'Secret Key': '   ' });

    await fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(Connect).not.toHaveBeenCalled();
  });

  it('connects once with trimmed values', async () => {
    render(SetupScreen);
    await fill(valid);

    await fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await vi.waitFor(() => expect(appState.connected).toBe(true));

    expect(Connect).toHaveBeenCalledTimes(1);
    expect(Connect).toHaveBeenCalledWith({
      endpoint: 'http://localhost:9000',
      accessKey: 'osodev',
      secretKey: 'osodevpass',
      region: 'us-east-1',
    });
  });

  it('falls back to us-east-1 for a blank region', async () => {
    render(SetupScreen);
    await fill({ ...valid, Region: '  ' });

    await fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await vi.waitFor(() => expect(appState.connected).toBe(true));

    expect(Connect).toHaveBeenCalledWith(expect.objectContaining({ region: 'us-east-1' }));
  });

  it('connects with a custom region when the form is submitted', async () => {
    render(SetupScreen);
    await fill({ ...valid, Region: 'eu-west-1' });

    await fireEvent.submit(screen.getByLabelText('Region').closest('form')!);
    await vi.waitFor(() => expect(appState.connected).toBe(true));

    expect(Connect).toHaveBeenCalledWith(expect.objectContaining({ region: 'eu-west-1' }));
  });

  it('shows the connection error and stays on the setup screen', async () => {
    vi.mocked(Connect).mockRejectedValue('connection failed: access denied');
    render(SetupScreen);
    await fill(valid);

    await fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText('connection failed: access denied')).toBeTruthy();
    expect(appState.connected).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Connect' }).disabled).toBe(false);
  });

  it('disables the button while connecting', async () => {
    const pending = deferred<void>();
    vi.mocked(Connect).mockReturnValue(pending.promise as never);
    render(SetupScreen);
    await fill(valid);

    await fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    const button = await screen.findByRole<HTMLButtonElement>('button', { name: /Connecting…/ });
    expect(button.disabled).toBe(true);

    pending.resolve();
    await vi.waitFor(() => expect(appState.connected).toBe(true));
  });

  it('takes over the profile that Connect created', async () => {
    vi.mocked(GetActiveProfileID).mockResolvedValue('new-profile');
    render(SetupScreen);
    await fill(valid);

    await fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await vi.waitFor(() => expect(appState.connected).toBe(true));

    expect(appState.activeProfileId).toBe('new-profile');
  });

  describe('saved connections', () => {
    const work = profile('work', { name: 'Work' });

    it('are hidden when there are none', () => {
      render(SetupScreen);
      expect(screen.queryByText('Saved connections')).toBeNull();
    });

    it('connect with one click', async () => {
      appState.profiles = [work, profile('home', { name: 'Home' })];
      render(SetupScreen);

      await fireEvent.click(screen.getByRole('button', { name: /Work/ }));
      await vi.waitFor(() => expect(appState.connected).toBe(true));

      expect(SwitchProfile).toHaveBeenCalledWith('work');
      expect(appState.activeProfileId).toBe('work');
      expect(Connect).not.toHaveBeenCalled();
    });

    it('show why a saved connection failed', async () => {
      vi.mocked(SwitchProfile).mockRejectedValue('connection failed: expired key');
      appState.profiles = [work];
      render(SetupScreen);

      await fireEvent.click(screen.getByRole('button', { name: /Work/ }));

      expect(await screen.findByText('connection failed: expired key')).toBeTruthy();
      expect(appState.connected).toBe(false);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /Work/ }).disabled).toBe(false);
    });

    it('are disabled while one of them connects', async () => {
      const pending = deferred<void>();
      vi.mocked(SwitchProfile).mockReturnValue(pending.promise as never);
      appState.profiles = [work];
      render(SetupScreen);
      const button = screen.getByRole<HTMLButtonElement>('button', { name: /Work/ });

      await fireEvent.click(button);

      await vi.waitFor(() => expect(button.disabled).toBe(true));
      expect(button.querySelector('.loading')).toBeTruthy();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Connect' }).disabled).toBe(true);
      pending.resolve();
      await vi.waitFor(() => expect(appState.connected).toBe(true));
    });
  });
});
