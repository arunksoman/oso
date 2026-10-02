import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { GetPresignedURL } from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import { deferred } from '../../test/helpers';
import PresignedUrlModal from './PresignedUrlModal.svelte';

const writeText = vi.fn();

function open() {
  appState.presignedUrlTarget = { bucket: 'b', key: 'docs/report.pdf', name: 'report.pdf' };
  appState.showPresignedUrl = true;
  return render(PresignedUrlModal);
}

describe('PresignedUrlModal', () => {
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.mocked(GetPresignedURL).mockResolvedValue('https://s3.example/signed');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates a one hour URL when opened', async () => {
    open();

    expect(await screen.findByText('https://s3.example/signed')).toBeTruthy();
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(GetPresignedURL).toHaveBeenCalledWith('b', 'docs/report.pdf', 3600);
  });

  it('regenerates with the chosen expiry', async () => {
    open();
    await screen.findByText('https://s3.example/signed');
    vi.mocked(GetPresignedURL).mockResolvedValue('https://s3.example/short');

    await fireEvent.change(screen.getByLabelText('Expires in'), { target: { value: '900' } });

    expect(await screen.findByText('https://s3.example/short')).toBeTruthy();
    expect(GetPresignedURL).toHaveBeenLastCalledWith('b', 'docs/report.pdf', 900);
  });

  it('regenerates on demand', async () => {
    open();
    await screen.findByText('https://s3.example/signed');

    await fireEvent.click(screen.getByTitle('Regenerate'));

    await vi.waitFor(() => expect(GetPresignedURL).toHaveBeenCalledTimes(2));
  });

  it('shows a spinner while generating', async () => {
    const pending = deferred<string>();
    vi.mocked(GetPresignedURL).mockReturnValue(pending.promise as never);
    const { container } = open();

    await vi.waitFor(() => expect(container.querySelector('.loading')).toBeTruthy());

    pending.resolve('https://s3.example/late');
    expect(await screen.findByText('https://s3.example/late')).toBeTruthy();
    expect(container.querySelector('.loading')).toBeNull();
  });

  it('shows the error instead of a URL', async () => {
    vi.mocked(GetPresignedURL).mockRejectedValue('not connected to S3');
    open();

    expect(await screen.findByText('not connected to S3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Copy to Clipboard/ })).toBeNull();
  });

  it('copies the URL and confirms for two seconds', async () => {
    open();
    await screen.findByText('https://s3.example/signed');
    vi.useFakeTimers();

    await fireEvent.click(screen.getByRole('button', { name: /Copy to Clipboard/ }));
    await vi.advanceTimersByTimeAsync(0);

    expect(writeText).toHaveBeenCalledWith('https://s3.example/signed');
    expect(screen.getByText(/Copied to clipboard!/)).toBeTruthy();

    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText(/Copy to Clipboard/)).toBeTruthy();
  });

  it('closes from the close button', async () => {
    open();
    await screen.findByText('https://s3.example/signed');

    await fireEvent.click(screen.getByRole('button', { name: '✕' }));

    expect(appState.showPresignedUrl).toBe(false);
    expect(appState.presignedUrlTarget).toBeNull();
  });

  it('closes on a backdrop click but not on a click inside the dialog', async () => {
    const { container } = open();
    await screen.findByText('https://s3.example/signed');

    await fireEvent.click(screen.getByText('Presigned URL'));
    expect(appState.showPresignedUrl).toBe(true);

    await fireEvent.click(container.querySelector('.fixed')!);
    expect(appState.showPresignedUrl).toBe(false);
  });

  it('does not call the backend without a target', async () => {
    appState.showPresignedUrl = true;
    render(PresignedUrlModal);

    await fireEvent.click(screen.getByTitle('Regenerate'));

    expect(GetPresignedURL).not.toHaveBeenCalled();
  });
});
