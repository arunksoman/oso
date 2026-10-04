import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { DeleteFolder, DeleteObjects } from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import { deferred } from '../../test/helpers';
import DeleteConfirmModal from './DeleteConfirmModal.svelte';

function open(keys: string[], hasFolder = false) {
  appState.deleteTarget = { bucket: 'b', keys, hasFolder };
  appState.showDeleteConfirm = true;
  appState.selectedKeys = new Set(keys);
  return render(DeleteConfirmModal);
}

async function confirmAndWait() {
  await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await vi.waitFor(() => expect(appState.showDeleteConfirm).toBe(false));
}

describe('DeleteConfirmModal', () => {
  it('shows how many items will be deleted', () => {
    open(['a.txt', 'b.txt']);
    expect(screen.getByText('2 item(s)')).toBeTruthy();
    expect(screen.queryByText(/deleted recursively/)).toBeNull();
  });

  it('warns that folders are deleted recursively', () => {
    open(['docs/'], true);
    expect(screen.getByText(/Folders will be deleted recursively/)).toBeTruthy();
  });

  it('deletes files and reports success', async () => {
    open(['a.txt', 'b.txt']);

    await confirmAndWait();

    expect(DeleteObjects).toHaveBeenCalledWith('b', ['a.txt', 'b.txt']);
    expect(DeleteFolder).not.toHaveBeenCalled();
    expect(appState.notification).toEqual({ message: 'Deleted 2 item(s)', type: 'success' });
    expect(appState.selectedKeys.size).toBe(0);
    expect(appState.refreshTrigger).toBeGreaterThan(0);
    expect(appState.deleteTarget).toBeNull();
  });

  it('deletes folders recursively and files in one call', async () => {
    open(['docs/', 'a.txt', 'img/'], true);

    await confirmAndWait();

    expect(vi.mocked(DeleteFolder).mock.calls).toEqual([
      ['b', 'docs/'],
      ['b', 'img/'],
    ]);
    expect(DeleteObjects).toHaveBeenCalledWith('b', ['a.txt']);
  });

  it('skips the file delete call when only folders are selected', async () => {
    open(['docs/'], true);

    await confirmAndWait();

    expect(DeleteFolder).toHaveBeenCalledWith('b', 'docs/');
    expect(DeleteObjects).not.toHaveBeenCalled();
  });

  it('reports a failure, keeps the selection and still closes', async () => {
    vi.mocked(DeleteObjects).mockRejectedValue('access denied');
    open(['a.txt']);

    await confirmAndWait();

    expect(appState.notification).toEqual({
      message: 'Delete failed: access denied',
      type: 'error',
    });
    expect(appState.selectedKeys.size).toBe(1);
  });

  it('disables both buttons while deleting', async () => {
    const pending = deferred<void>();
    vi.mocked(DeleteObjects).mockReturnValue(pending.promise as never);
    open(['a.txt']);

    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/Deleting…/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true);

    pending.resolve();
    await vi.waitFor(() => expect(appState.showDeleteConfirm).toBe(false));
  });

  it('closes the properties panel of a deleted object', async () => {
    open(['docs/', 'a.txt']);

    appState.propertiesTarget = { bucket: 'b', key: 'docs/deep/report.pdf', name: 'report.pdf' };
    await confirmAndWait();
    expect(appState.propertiesTarget).toBeNull();
  });

  it('keeps the properties panel of an object that was not deleted', async () => {
    open(['a.txt']);
    appState.propertiesTarget = { bucket: 'b', key: 'b.txt', name: 'b.txt' };

    await confirmAndWait();

    expect(appState.propertiesTarget?.key).toBe('b.txt');
  });

  it('cancels without deleting', async () => {
    open(['a.txt']);

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(DeleteObjects).not.toHaveBeenCalled();
    expect(appState.showDeleteConfirm).toBe(false);
    expect(appState.deleteTarget).toBeNull();
  });

  it('cancels on a backdrop click but not on a click inside the dialog', async () => {
    const { container } = open(['a.txt']);

    await fireEvent.click(screen.getByText('Confirm Delete'));
    expect(appState.showDeleteConfirm).toBe(true);

    await fireEvent.click(container.querySelector('.absolute')!);
    expect(appState.showDeleteConfirm).toBe(false);
  });

  it('does nothing without a target', async () => {
    appState.showDeleteConfirm = true;
    render(DeleteConfirmModal);

    expect(screen.getByText('0 item(s)')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(DeleteObjects).not.toHaveBeenCalled();
    expect(appState.showDeleteConfirm).toBe(true);
  });
});
