import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { DeleteBucket } from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import { deferred, file } from '../../test/helpers';
import DeleteBucketModal from './DeleteBucketModal.svelte';

function open(name = 'photos') {
  appState.deleteBucketTarget = name;
  return render(DeleteBucketModal);
}

const nameInput = () => screen.getByLabelText<HTMLInputElement>(/to confirm/);
const deleteButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /Delete bucket|Deleting/ });
const type = (value: string) => fireEvent.input(nameInput(), { target: { value } });

describe('DeleteBucketModal', () => {
  it('names the bucket and focuses the confirmation input', () => {
    open();

    expect(screen.getByText('Delete Bucket')).toBeTruthy();
    expect(screen.getAllByText('photos').length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(nameInput());
  });

  it('only enables delete once the exact name is typed', async () => {
    open();
    expect(deleteButton().disabled).toBe(true);

    await type('photo');
    expect(deleteButton().disabled).toBe(true);

    await type('Photos');
    expect(deleteButton().disabled).toBe(true);

    await type('photos');
    expect(deleteButton().disabled).toBe(false);
  });

  it('does not delete on Enter before the name matches', async () => {
    open();
    await type('wrong');

    await fireEvent.submit(nameInput().closest('form')!);

    expect(DeleteBucket).not.toHaveBeenCalled();
  });

  it('deletes the bucket, reloads the list and closes', async () => {
    open();
    await type('photos');

    await fireEvent.click(deleteButton());
    await vi.waitFor(() => expect(appState.deleteBucketTarget).toBeNull());

    expect(DeleteBucket).toHaveBeenCalledWith('photos', false);
    expect(appState.notification).toEqual({ message: 'Bucket "photos" deleted', type: 'success' });
    expect(appState.bucketsTrigger).toBe(1);
  });

  it('empties the bucket first when asked', async () => {
    open();
    await fireEvent.click(screen.getByRole('checkbox'));
    await type('photos');

    await fireEvent.submit(nameInput().closest('form')!);

    await vi.waitFor(() => expect(DeleteBucket).toHaveBeenCalledWith('photos', true));
  });

  it('leaves the deleted bucket when it was open', async () => {
    appState.currentBucket = 'photos';
    appState.currentPrefix = '2026/';
    appState.objects = [file('2026/a.jpg')];
    appState.selectedKeys = new Set(['2026/a.jpg']);
    appState.clipboard = { operation: 'copy', bucket: 'photos', keys: ['2026/a.jpg'] };
    appState.propertiesTarget = { bucket: 'photos', key: '2026/a.jpg', name: 'a.jpg' };
    open();
    await type('photos');

    await fireEvent.click(deleteButton());
    await vi.waitFor(() => expect(appState.deleteBucketTarget).toBeNull());

    expect(appState.currentBucket).toBeNull();
    expect(appState.currentPrefix).toBe('');
    expect(appState.objects).toEqual([]);
    expect(appState.selectedKeys.size).toBe(0);
    expect(appState.clipboard).toBeNull();
    expect(appState.propertiesTarget).toBeNull();
  });

  it('keeps another open bucket and its clipboard', async () => {
    appState.currentBucket = 'documents';
    appState.clipboard = { operation: 'copy', bucket: 'documents', keys: ['a.txt'] };
    open();
    await type('photos');

    await fireEvent.click(deleteButton());
    await vi.waitFor(() => expect(appState.deleteBucketTarget).toBeNull());

    expect(appState.currentBucket).toBe('documents');
    expect(appState.clipboard).not.toBeNull();
  });

  it('shows the server error and stays open', async () => {
    vi.mocked(DeleteBucket).mockRejectedValue('failed to delete bucket: BucketNotEmpty');
    open();
    await type('photos');

    await fireEvent.click(deleteButton());

    expect(await screen.findByText('failed to delete bucket: BucketNotEmpty')).toBeTruthy();
    expect(appState.deleteBucketTarget).toBe('photos');
    expect(appState.bucketsTrigger).toBe(0);
    expect(deleteButton().disabled).toBe(false);
  });

  it('cannot be cancelled while deleting', async () => {
    const pending = deferred<void>();
    vi.mocked(DeleteBucket).mockReturnValue(pending.promise as never);
    const { container } = open();
    await type('photos');

    await fireEvent.click(deleteButton());

    expect(await screen.findByText(/Deleting…/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true);
    await fireEvent.click(container.querySelector('.absolute')!);
    expect(appState.deleteBucketTarget).toBe('photos');
    // A second submit while the first one runs is ignored
    await fireEvent.submit(nameInput().closest('form')!);
    expect(DeleteBucket).toHaveBeenCalledTimes(1);

    pending.resolve();
    await vi.waitFor(() => expect(appState.deleteBucketTarget).toBeNull());
  });

  it('cancels with the button, Escape or the backdrop but not a click inside', async () => {
    const { container } = open();

    await fireEvent.click(screen.getByText('Delete Bucket'));
    expect(appState.deleteBucketTarget).toBe('photos');

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(appState.deleteBucketTarget).toBeNull();

    appState.deleteBucketTarget = 'photos';
    await fireEvent.keyDown(nameInput(), { key: 'Escape' });
    expect(appState.deleteBucketTarget).toBeNull();

    appState.deleteBucketTarget = 'photos';
    await fireEvent.keyDown(nameInput(), { key: 'a' });
    expect(appState.deleteBucketTarget).toBe('photos');
    await fireEvent.click(container.querySelector('.absolute')!);
    expect(appState.deleteBucketTarget).toBeNull();
    expect(DeleteBucket).not.toHaveBeenCalled();
  });
});
