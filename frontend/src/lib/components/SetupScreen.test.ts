import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { Connect } from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import { deferred } from '../../test/helpers';
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
});
