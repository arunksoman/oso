import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import {
  CopyFolder,
  CopyObject,
  CreateFolder,
  DownloadObject,
  ListObjects,
  MoveFolder,
  MoveObject,
  OpenDirectoryDialog,
  OpenMultipleFilesDialog,
  SaveFileDialog,
  SearchObjects,
  UploadFile,
  UploadFiles,
} from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import type { S3Object } from '$lib/stores/appState.svelte';
import { deferred, emitEvent, file, folder } from '../../test/helpers';
import FileExplorer from './FileExplorer.svelte';

// happy-dom has no layout, so the real virtualizer would render no rows.
// This stand-in renders the first `limit` rows and keeps the same store API.
const virtual = vi.hoisted(() => ({ limit: Infinity }));

vi.mock('@tanstack/svelte-virtual', async () => {
  const { writable } = await import('svelte/store');
  type Options = { count: number; getScrollElement: () => unknown; estimateSize: () => number };
  return {
    createVirtualizer: (options: Options) => {
      let current = options;
      const snapshot = () => ({
        setOptions(next: Options) {
          current = next;
          store.set(snapshot());
        },
        getVirtualItems() {
          current.getScrollElement();
          const size = current.estimateSize();
          const count = Math.min(current.count, virtual.limit);
          return Array.from({ length: count }, (_, index) => ({ index, size, start: index * size }));
        },
        getTotalSize: () => current.count * current.estimateSize(),
      });
      const store = writable(snapshot());
      return store;
    },
  };
});

const objects = [folder('docs/'), file('a.txt'), file('b.txt'), file('c.txt')];

function listing(items: S3Object[], nextToken = '') {
  return { objects: items, nextContinuationToken: nextToken, hasMore: nextToken !== '' };
}

async function open(items: S3Object[] = objects) {
  appState.currentBucket = 'b';
  vi.mocked(ListObjects).mockResolvedValue(listing(items));
  const view = render(FileExplorer);
  if (items.length > 0) await screen.findByText(items[0].name);
  return view;
}

const row = (name: string) => screen.getByText(name).closest('tr')!;
const ctrlClick = (name: string) => fireEvent.click(row(name), { ctrlKey: true });
const press = (key: string, modifiers: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.body, { key, ...modifiers });
const selected = () => [...appState.selectedKeys];
const filter = (value: string) =>
  fireEvent.input(screen.getByPlaceholderText('Filter...'), { target: { value } });

async function openRowMenu(name: string) {
  await fireEvent.contextMenu(row(name), { clientX: 50, clientY: 60 });
  return within(screen.getByRole('menu'));
}

async function openBackgroundMenu(container: HTMLElement) {
  await fireEvent.contextMenu(container.querySelector('.overflow-y-auto')!);
  return within(screen.getByRole('menu'));
}

describe('FileExplorer', () => {
  beforeEach(() => {
    virtual.limit = Infinity;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listing', () => {
    it('asks for a bucket first', () => {
      render(FileExplorer);
      expect(screen.getByText('Select a bucket from the sidebar')).toBeTruthy();
      expect(ListObjects).not.toHaveBeenCalled();
    });

    it('lists the current folder with details', async () => {
      await open();

      expect(ListObjects).toHaveBeenCalledWith('b', '', '', 1000);
      expect(screen.getByText('docs')).toBeTruthy();
      expect(within(row('a.txt')).getByText('10 B')).toBeTruthy();
      expect(within(row('a.txt')).getByText('TXT')).toBeTruthy();
      expect(within(row('docs')).getByText('Folder')).toBeTruthy();
      expect(screen.getByText('4 items')).toBeTruthy();
      expect(appState.isLoading).toBe(false);
    });

    it('uses the configured page size', async () => {
      appState.settings.pageSize = 250;
      await open();
      expect(ListObjects).toHaveBeenCalledWith('b', '', '', 250);
    });

    it('falls back to 1000 when the page size is unset', async () => {
      appState.settings.pageSize = 0;
      await open();
      expect(ListObjects).toHaveBeenCalledWith('b', '', '', 1000);
    });

    it('hides the detail columns when disabled', async () => {
      appState.settings.showFileDetails = false;
      await open();
      expect(screen.queryByText('Size')).toBeNull();
      expect(screen.queryByText('10 B')).toBeNull();
    });

    it('shows the empty state for an empty or missing result', async () => {
      appState.currentBucket = 'b';
      vi.mocked(ListObjects).mockResolvedValue(null as never);
      render(FileExplorer);

      expect(await screen.findByText('This folder is empty')).toBeTruthy();
      expect(appState.objects).toEqual([]);
      expect(appState.hasMore).toBe(false);
    });

    it('reports a load failure', async () => {
      appState.currentBucket = 'b';
      vi.mocked(ListObjects).mockRejectedValue('access denied');
      render(FileExplorer);

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({
          message: 'Load failed: access denied',
          type: 'error',
        })
      );
      expect(appState.isLoading).toBe(false);
    });

    it('reloads when the folder changes', async () => {
      await open();

      appState.currentPrefix = 'docs/';

      await vi.waitFor(() => expect(ListObjects).toHaveBeenLastCalledWith('b', 'docs/', '', 1000));
    });

    it('reloads on a refresh trigger', async () => {
      await open();

      appState.refreshTrigger = Date.now();

      await vi.waitFor(() => expect(ListObjects).toHaveBeenCalledTimes(2));
    });

    it('ignores a refresh trigger without a bucket', async () => {
      render(FileExplorer);

      appState.refreshTrigger = Date.now();
      await Promise.resolve();

      expect(ListObjects).not.toHaveBeenCalled();
    });
  });

  describe('pagination', () => {
    const page1 = Array.from({ length: 20 }, (_, i) => file(`file-${String(i).padStart(2, '0')}.txt`));
    const page2 = [file('file-20.txt'), file('file-21.txt')];

    it('loads the next page automatically when the last rows are visible', async () => {
      appState.currentBucket = 'b';
      vi.mocked(ListObjects)
        .mockResolvedValueOnce(listing(page1, 'token-1'))
        .mockResolvedValueOnce(listing(page2));
      render(FileExplorer);

      expect(await screen.findByText('file-21.txt')).toBeTruthy();
      expect(ListObjects).toHaveBeenNthCalledWith(2, 'b', '', 'token-1', 1000);
      expect(appState.objects).toHaveLength(22);
      expect(appState.hasMore).toBe(false);
    });

    it('waits for the user when the end of the list is not visible', async () => {
      virtual.limit = 5;
      appState.currentBucket = 'b';
      vi.mocked(ListObjects)
        .mockResolvedValueOnce(listing(page1, 'token-1'))
        .mockResolvedValueOnce(listing(page2));
      render(FileExplorer);

      const loadMore = await screen.findByRole('button', { name: 'Load more' });
      expect(ListObjects).toHaveBeenCalledTimes(1);

      await fireEvent.click(loadMore);

      await vi.waitFor(() => expect(appState.objects).toHaveLength(22));
      expect(ListObjects).toHaveBeenNthCalledWith(2, 'b', '', 'token-1', 1000);
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    });

    it('never requests two pages at once', async () => {
      virtual.limit = 5;
      appState.currentBucket = 'b';
      const pending = deferred<ReturnType<typeof listing>>();
      vi.mocked(ListObjects)
        .mockResolvedValueOnce(listing(page1, 'token-1'))
        .mockReturnValueOnce(pending.promise as never);
      render(FileExplorer);
      const loadMore = await screen.findByRole('button', { name: 'Load more' });

      await fireEvent.click(loadMore);
      appState.refreshTrigger = Date.now();
      await Promise.resolve();

      expect(ListObjects).toHaveBeenCalledTimes(2);
      pending.resolve(listing(page2));
      await vi.waitFor(() => expect(appState.objects).toHaveLength(22));
    });
  });

  describe('navigation', () => {
    it('opens a folder on double click and resets state', async () => {
      await open();
      appState.searchQuery = '';
      await ctrlClick('a.txt');

      await fireEvent.dblClick(row('docs'));

      expect(appState.currentPrefix).toBe('docs/');
      expect(appState.selectedKeys.size).toBe(0);
      await vi.waitFor(() => expect(ListObjects).toHaveBeenLastCalledWith('b', 'docs/', '', 1000));
    });

    it('does not navigate into a file', async () => {
      await open();

      await fireEvent.dblClick(row('a.txt'));

      expect(appState.currentPrefix).toBe('');
      expect(ListObjects).toHaveBeenCalledTimes(1);
    });
  });

  describe('selection', () => {
    it('ignores a plain click', async () => {
      await open();
      await fireEvent.click(row('a.txt'));
      expect(selected()).toEqual([]);
    });

    it('toggles items with ctrl or meta click', async () => {
      await open();

      await ctrlClick('a.txt');
      await fireEvent.click(row('c.txt'), { metaKey: true });
      expect(selected()).toEqual(['a.txt', 'c.txt']);
      expect(screen.getByText('2 selected')).toBeTruthy();

      await ctrlClick('a.txt');
      expect(selected()).toEqual(['c.txt']);
    });

    it('selects a range with shift click', async () => {
      await open();
      await ctrlClick('c.txt');

      await fireEvent.click(row('a.txt'), { shiftKey: true });

      expect(selected().sort()).toEqual(['a.txt', 'b.txt', 'c.txt']);
    });

    it('ignores shift click without an anchor', async () => {
      await open();
      await fireEvent.click(row('a.txt'), { shiftKey: true });
      expect(selected()).toEqual([]);
    });

    it('toggles a row with its checkbox', async () => {
      await open();
      const checkbox = within(row('b.txt')).getByRole('checkbox');

      await fireEvent.click(checkbox);
      expect(selected()).toEqual(['b.txt']);

      await fireEvent.click(checkbox);
      expect(selected()).toEqual([]);
    });

    it('toggles everything with the header checkbox', async () => {
      await open();
      const header = screen.getAllByRole<HTMLInputElement>('checkbox')[0];

      await ctrlClick('a.txt');
      expect(header.indeterminate).toBe(true);

      await fireEvent.click(header);
      expect(selected()).toHaveLength(4);
      expect(header.checked).toBe(true);

      await fireEvent.click(header);
      expect(selected()).toEqual([]);
    });

    it('selects all with Ctrl+A and clears with Escape', async () => {
      await open();

      await press('a', { ctrlKey: true });
      expect(selected()).toHaveLength(4);

      await press('Escape');
      expect(selected()).toEqual([]);
    });

    it('clears from the action bar', async () => {
      await open();
      await ctrlClick('a.txt');

      await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

      expect(selected()).toEqual([]);
    });

    it('leaves shortcuts alone while typing in an input', async () => {
      await open();

      await fireEvent.keyDown(screen.getByPlaceholderText('Filter...'), { key: 'a', ctrlKey: true });

      expect(selected()).toEqual([]);
    });
  });

  describe('delete', () => {
    it('asks for confirmation with the Delete key', async () => {
      await open();
      await ctrlClick('a.txt');
      await ctrlClick('docs');

      await press('Delete');

      expect(appState.showDeleteConfirm).toBe(true);
      expect(appState.deleteTarget).toEqual({
        bucket: 'b',
        keys: ['a.txt', 'docs/'],
        hasFolder: true,
      });
    });

    it('asks for confirmation with Backspace and from the action bar', async () => {
      await open();
      await ctrlClick('a.txt');

      await press('Backspace');
      expect(appState.deleteTarget).toEqual({ bucket: 'b', keys: ['a.txt'], hasFolder: false });

      appState.showDeleteConfirm = false;
      await fireEvent.click(screen.getByTitle('Delete selected'));
      expect(appState.showDeleteConfirm).toBe(true);
    });

    it('does nothing without a selection', async () => {
      await open();
      await press('Delete');
      expect(appState.showDeleteConfirm).toBe(false);
    });
  });

  describe('clipboard', () => {
    it('copies the selection', async () => {
      await open();
      await ctrlClick('a.txt');

      await press('c', { ctrlKey: true });

      expect(appState.clipboard).toEqual({ operation: 'copy', bucket: 'b', keys: ['a.txt'] });
      expect(appState.notification).toEqual({ message: '1 item(s) copied', type: 'info' });
      expect(within(row('a.txt')).getByText('(copy)')).toBeTruthy();
    });

    it('cuts the selection', async () => {
      await open();
      await ctrlClick('a.txt');
      await ctrlClick('b.txt');

      await press('x', { metaKey: true });

      expect(appState.clipboard).toEqual({ operation: 'cut', bucket: 'b', keys: ['a.txt', 'b.txt'] });
      expect(appState.notification).toEqual({ message: '2 item(s) cut', type: 'info' });
    });

    it('copies and cuts from the action bar', async () => {
      await open();
      await ctrlClick('a.txt');

      await fireEvent.click(screen.getByTitle('Copy'));
      expect(appState.clipboard?.operation).toBe('copy');

      await fireEvent.click(screen.getByTitle('Cut'));
      expect(appState.clipboard?.operation).toBe('cut');
    });

    it('does nothing without a selection or clipboard', async () => {
      await open();

      await press('c', { ctrlKey: true });
      await press('x', { ctrlKey: true });
      await press('v', { ctrlKey: true });

      expect(appState.clipboard).toBeNull();
      expect(CopyObject).not.toHaveBeenCalled();
    });

    it('pastes copied files and folders into the current folder', async () => {
      appState.currentPrefix = 'dest/';
      appState.clipboard = { operation: 'copy', bucket: 'other', keys: ['src/a.txt', 'src/docs/'] };
      await open();

      await press('v', { ctrlKey: true });
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(CopyObject).toHaveBeenCalledWith('other', 'src/a.txt', 'b', 'dest/a.txt');
      expect(CopyFolder).toHaveBeenCalledWith('other', 'src/docs/', 'b', 'dest/docs/');
      expect(appState.notification).toEqual({ message: 'Pasted 2 item(s)', type: 'success' });
      expect(appState.clipboard).not.toBeNull();
      expect(appState.refreshTrigger).toBeGreaterThan(0);
    });

    it('moves cut items and empties the clipboard', async () => {
      appState.clipboard = { operation: 'cut', bucket: 'b', keys: ['src/a.txt', 'src/docs/'] };
      await open();

      await press('v', { ctrlKey: true });
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(MoveObject).toHaveBeenCalledWith('b', 'src/a.txt', 'b', 'a.txt');
      expect(MoveFolder).toHaveBeenCalledWith('b', 'src/docs/', 'b', 'docs/');
      expect(appState.clipboard).toBeNull();
    });

    it('warns when only some items could be pasted', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      appState.clipboard = { operation: 'copy', bucket: 'b', keys: ['x/a.txt', 'x/b.txt'] };
      vi.mocked(CopyObject).mockRejectedValueOnce('denied');
      await open();

      await press('v', { ctrlKey: true });
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(appState.notification).toEqual({
        message: 'Pasted 1 item(s), 1 failed',
        type: 'warning',
      });
    });

    it('reports when nothing could be pasted', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      appState.clipboard = { operation: 'copy', bucket: 'b', keys: ['x/a.txt', 'x/b.txt'] };
      vi.mocked(CopyObject).mockRejectedValue('denied');
      await open();

      await press('v', { ctrlKey: true });
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(appState.notification).toEqual({
        message: 'Paste failed for all 2 item(s)',
        type: 'error',
      });
    });

    it('offers paste and clear in the clipboard bar', async () => {
      appState.clipboard = { operation: 'cut', bucket: 'b', keys: ['x/a.txt'] };
      await open();
      expect(screen.getByText('1 item(s) ready to cut')).toBeTruthy();

      await fireEvent.click(screen.getByRole('button', { name: 'Paste here' }));
      await vi.waitFor(() => expect(MoveObject).toHaveBeenCalledWith('b', 'x/a.txt', 'b', 'a.txt'));

      appState.clipboard = { operation: 'copy', bucket: 'b', keys: ['x/a.txt'] };
      await fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
      expect(appState.clipboard).toBeNull();
    });

    it('offers paste in the action bar while items are selected', async () => {
      appState.clipboard = { operation: 'copy', bucket: 'b', keys: ['x/a.txt'] };
      await open();
      await ctrlClick('b.txt');

      await fireEvent.click(screen.getByTitle('Paste'));

      await vi.waitFor(() => expect(CopyObject).toHaveBeenCalledWith('b', 'x/a.txt', 'b', 'a.txt'));
    });
  });

  describe('download', () => {
    it('asks where to save, then downloads', async () => {
      vi.mocked(SaveFileDialog).mockResolvedValue('/tmp/a.txt');
      await open();
      await ctrlClick('docs');
      await ctrlClick('a.txt');

      await fireEvent.click(screen.getByTitle('Download'));
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(SaveFileDialog).toHaveBeenCalledWith('a.txt');
      expect(DownloadObject).toHaveBeenCalledWith('b', 'a.txt', '/tmp/a.txt');
      expect(appState.notification).toEqual({ message: 'Downloaded "a.txt"', type: 'success' });
    });

    it('stops when the save dialog is cancelled', async () => {
      vi.mocked(SaveFileDialog).mockResolvedValue('');
      await open();
      await ctrlClick('a.txt');

      await fireEvent.click(screen.getByTitle('Download'));
      await vi.waitFor(() => expect(SaveFileDialog).toHaveBeenCalled());

      expect(DownloadObject).not.toHaveBeenCalled();
    });

    it('uses the default folder when asking is disabled', async () => {
      appState.settings.askBeforeDownload = false;
      appState.settings.defaultDownloadPath = '/home/me/Downloads';
      await open();
      await ctrlClick('a.txt');

      await fireEvent.click(screen.getByTitle('Download'));
      await vi.waitFor(() => expect(DownloadObject).toHaveBeenCalled());

      expect(SaveFileDialog).not.toHaveBeenCalled();
      expect(DownloadObject).toHaveBeenCalledWith('b', 'a.txt', '/home/me/Downloads/a.txt');
    });

    it('reports a failed download', async () => {
      appState.settings.askBeforeDownload = false;
      vi.mocked(DownloadObject).mockRejectedValue('disk full');
      await open();
      await ctrlClick('a.txt');

      await fireEvent.click(screen.getByTitle('Download'));

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({
          message: 'Download failed: disk full',
          type: 'error',
        })
      );
    });

    it('is not offered when only folders are selected', async () => {
      await open();
      await ctrlClick('docs');
      expect(screen.queryByTitle('Download')).toBeNull();
    });
  });

  describe('context menu', () => {
    it('opens for a file and selects it', async () => {
      await open();
      await ctrlClick('b.txt');

      const menu = await openRowMenu('a.txt');

      expect(selected()).toEqual(['a.txt']);
      expect(menu.getByText('Download')).toBeTruthy();
      expect(menu.getByText('Copy presigned URL')).toBeTruthy();
      expect(menu.queryByText(/Paste/)).toBeNull();
      const style = screen.getByRole('menu').getAttribute('style') ?? '';
      expect(style).toContain('left: 50px');
      expect(style).toContain('top: 60px');
    });

    it('keeps a multi selection when one of its rows is right-clicked', async () => {
      await open();
      await ctrlClick('a.txt');
      await ctrlClick('b.txt');

      await openRowMenu('a.txt');

      expect(selected()).toEqual(['a.txt', 'b.txt']);
    });

    it('hides file-only actions for a folder', async () => {
      await open();
      const menu = await openRowMenu('docs');
      expect(menu.queryByText('Download')).toBeNull();
      expect(menu.queryByText('Copy presigned URL')).toBeNull();
      expect(menu.getByText('Delete')).toBeTruthy();
    });

    it('downloads the clicked file', async () => {
      vi.mocked(SaveFileDialog).mockResolvedValue('/tmp/b.txt');
      await open();
      const menu = await openRowMenu('b.txt');

      await fireEvent.click(menu.getByText('Download'));

      await vi.waitFor(() => expect(DownloadObject).toHaveBeenCalledWith('b', 'b.txt', '/tmp/b.txt'));
      await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    });

    it('opens the properties panel for the clicked file', async () => {
      await open();
      const menu = await openRowMenu('b.txt');

      await fireEvent.click(menu.getByText('Properties'));

      expect(appState.propertiesTarget).toEqual({ bucket: 'b', key: 'b.txt', name: 'b.txt' });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('does not offer properties for a folder', async () => {
      await open();
      const menu = await openRowMenu('docs');
      expect(menu.queryByText('Properties')).toBeNull();
    });

    it('opens the presigned URL modal for the clicked file', async () => {
      await open();
      const menu = await openRowMenu('b.txt');

      await fireEvent.click(menu.getByText('Copy presigned URL'));

      expect(appState.showPresignedUrl).toBe(true);
      expect(appState.presignedUrlTarget).toEqual({ bucket: 'b', key: 'b.txt', name: 'b.txt' });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('copies, cuts, pastes and deletes from the menu', async () => {
      await open();

      await fireEvent.click((await openRowMenu('a.txt')).getByText('Copy'));
      expect(appState.clipboard).toEqual({ operation: 'copy', bucket: 'b', keys: ['a.txt'] });
      expect(screen.queryByRole('menu')).toBeNull();

      await fireEvent.click((await openRowMenu('a.txt')).getByText('Cut'));
      expect(appState.clipboard?.operation).toBe('cut');

      await fireEvent.click((await openRowMenu('b.txt')).getByText('Paste (1)'));
      await vi.waitFor(() => expect(MoveObject).toHaveBeenCalledWith('b', 'a.txt', 'b', 'a.txt'));

      await fireEvent.click((await openRowMenu('c.txt')).getByText('Delete'));
      expect(appState.deleteTarget).toEqual({ bucket: 'b', keys: ['c.txt'], hasFolder: false });
    });

    it('closes on Escape and on a click elsewhere', async () => {
      await open();

      await openRowMenu('a.txt');
      await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();

      await openRowMenu('a.txt');
      await fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
      await fireEvent.click(screen.getByRole('menu'));
      expect(screen.getByRole('menu')).toBeTruthy();

      await fireEvent.click(document.body);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('suppresses the native menu on the custom menu', async () => {
      await open();
      await openRowMenu('a.txt');

      const allowed = await fireEvent.contextMenu(screen.getByRole('menu'));

      expect(allowed).toBe(false);
    });

    it('opens from the row action button', async () => {
      await open();
      const button = within(row('a.txt')).getByTitle('Actions');

      await fireEvent.click(button);
      expect(selected()).toEqual(['a.txt']);
      expect(screen.getByRole('menu').getAttribute('style')).toContain('left: 0px');

      await fireEvent.click(document.body);
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
        left: 500,
        right: 520,
        bottom: 100,
      } as DOMRect);
      await fireEvent.click(button);

      const style = screen.getByRole('menu').getAttribute('style') ?? '';
      expect(style).toContain('left: 308px');
      expect(style).toContain('top: 100px');
    });

    it('offers folder actions on the background', async () => {
      const { container } = await open();

      const menu = await openBackgroundMenu(container);

      expect(menu.getByText('New folder')).toBeTruthy();
      expect(menu.getByText('Upload files')).toBeTruthy();
      expect(menu.getByText('Upload folder')).toBeTruthy();
      expect(menu.queryByText(/Paste/)).toBeNull();
      expect(menu.queryByText('Delete')).toBeNull();
    });

    it('offers paste on the background when the clipboard has items', async () => {
      appState.clipboard = { operation: 'copy', bucket: 'b', keys: ['x/a.txt', 'x/b.txt'] };
      const { container } = await open();

      await fireEvent.click((await openBackgroundMenu(container)).getByText('Paste (2)'));

      await vi.waitFor(() => expect(CopyObject).toHaveBeenCalledTimes(2));
    });
  });

  describe('new folder', () => {
    async function openBar(container: HTMLElement) {
      await fireEvent.click((await openBackgroundMenu(container)).getByText('New folder'));
      return screen.getByPlaceholderText('folder-name');
    }

    it('creates a folder in the current folder', async () => {
      appState.currentPrefix = 'docs/';
      const { container } = await open();
      const input = await openBar(container);
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(input);

      await fireEvent.input(input, { target: { value: '  reports  ' } });
      await fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await vi.waitFor(() => expect(appState.showNewFolder).toBe(false));

      expect(CreateFolder).toHaveBeenCalledWith('b', 'docs/', 'reports');
      expect(appState.notification).toEqual({ message: 'Folder created', type: 'success' });
      expect(appState.refreshTrigger).toBeGreaterThan(0);
    });

    it('creates on Enter and ignores an empty name', async () => {
      const { container } = await open();
      const input = await openBar(container);

      await fireEvent.keyDown(input, { key: 'Enter' });
      expect(CreateFolder).not.toHaveBeenCalled();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create' }).disabled).toBe(true);

      await fireEvent.input(input, { target: { value: 'reports' } });
      await fireEvent.keyDown(input, { key: 'Enter' });
      await vi.waitFor(() => expect(CreateFolder).toHaveBeenCalledWith('b', '', 'reports'));
    });

    it('shows a spinner while creating and reports a failure', async () => {
      const pending = deferred<void>();
      vi.mocked(CreateFolder).mockReturnValue(pending.promise as never);
      const { container } = await open();
      const input = await openBar(container);
      await fireEvent.input(input, { target: { value: 'reports' } });

      await fireEvent.keyDown(input, { key: 'Enter' });
      await vi.waitFor(() => expect(input.parentElement?.querySelector('.loading')).toBeTruthy());

      pending.reject('access denied');
      await vi.waitFor(() =>
        expect(appState.notification).toEqual({
          message: 'Create folder failed: access denied',
          type: 'error',
        })
      );
      expect(appState.showNewFolder).toBe(true);
    });

    it('cancels with Escape or the Cancel button', async () => {
      const { container } = await open();
      let input = await openBar(container);
      await fireEvent.input(input, { target: { value: 'draft' } });

      await fireEvent.keyDown(input, { key: 'Escape' });
      expect(appState.showNewFolder).toBe(false);

      input = await openBar(container);
      expect((input as HTMLInputElement).value).toBe('');
      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(appState.showNewFolder).toBe(false);
    });
  });

  describe('upload', () => {
    it('uploads one file from the empty state', async () => {
      vi.mocked(OpenMultipleFilesDialog).mockResolvedValue(['/home/me/report.pdf']);
      appState.currentPrefix = 'docs/';
      await open([]);

      await fireEvent.click(await screen.findByRole('button', { name: 'Upload files' }));
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(UploadFiles).toHaveBeenCalledWith('b', 'docs/', ['/home/me/report.pdf']);
      expect(appState.notification).toEqual({ message: 'Uploaded "report.pdf"', type: 'success' });
      expect(appState.uploadBatch).toBeNull();
    });

    it('starts a batch for several files', async () => {
      vi.mocked(OpenMultipleFilesDialog).mockResolvedValue(['/a.txt', '/b.txt']);
      const { container } = await open();

      await fireEvent.click((await openBackgroundMenu(container)).getByText('Upload files'));
      await vi.waitFor(() => expect(UploadFiles).toHaveBeenCalled());

      expect(appState.uploadBatch).toEqual({ total: 2, done: 0, errors: 0 });
      await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    });

    it('does nothing when the file dialog is cancelled', async () => {
      vi.mocked(OpenMultipleFilesDialog).mockResolvedValue(null as never);
      const { container } = await open();

      await fireEvent.click((await openBackgroundMenu(container)).getByText('Upload files'));
      await vi.waitFor(() => expect(OpenMultipleFilesDialog).toHaveBeenCalled());

      expect(UploadFiles).not.toHaveBeenCalled();
    });

    it('reports a failed file upload and drops the batch', async () => {
      vi.mocked(OpenMultipleFilesDialog).mockResolvedValue(['/a.txt', '/b.txt']);
      vi.mocked(UploadFiles).mockRejectedValue('disk error');
      const { container } = await open();

      await fireEvent.click((await openBackgroundMenu(container)).getByText('Upload files'));

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({
          message: 'Upload failed: disk error',
          type: 'error',
        })
      );
      expect(appState.uploadBatch).toBeNull();
    });

    it('uploads a folder', async () => {
      vi.mocked(OpenDirectoryDialog).mockResolvedValue('/home/me/photos');
      const { container } = await open();

      await fireEvent.click((await openBackgroundMenu(container)).getByText('Upload folder'));

      await vi.waitFor(() => expect(UploadFile).toHaveBeenCalledWith('b', '', '/home/me/photos'));
      await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    });

    it('does nothing when the folder dialog is cancelled', async () => {
      vi.mocked(OpenDirectoryDialog).mockResolvedValue('');
      const { container } = await open();

      await fireEvent.click((await openBackgroundMenu(container)).getByText('Upload folder'));
      await vi.waitFor(() => expect(OpenDirectoryDialog).toHaveBeenCalled());

      expect(UploadFile).not.toHaveBeenCalled();
    });

    it('reports a failed folder upload', async () => {
      vi.mocked(OpenDirectoryDialog).mockResolvedValue('/home/me/photos');
      vi.mocked(UploadFile).mockRejectedValue('disk error');
      appState.uploadBatch = { total: 3, done: 1, errors: 0 };
      const { container } = await open();

      await fireEvent.click((await openBackgroundMenu(container)).getByText('Upload folder'));

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({
          message: 'Upload failed: disk error',
          type: 'error',
        })
      );
      expect(appState.uploadBatch).toBeNull();
    });
  });

  describe('search', () => {
    it('filters locally at once, then searches the server', async () => {
      vi.mocked(SearchObjects).mockResolvedValue([file('deep-report.txt'), file('report-2.txt')]);
      appState.currentPrefix = 'docs/';
      await open();

      await filter('  A.TXT ');
      expect(screen.queryByText('b.txt')).toBeNull();
      expect(screen.getByText('a.txt')).toBeTruthy();

      expect(await screen.findByText('deep-report.txt')).toBeTruthy();
      expect(SearchObjects).toHaveBeenCalledWith('b', 'docs/', 'A.TXT', 2000);
      expect(screen.getByText('2 match(es)')).toBeTruthy();
      expect(screen.queryByText('a.txt')).toBeNull();
    });

    it('waits for typing to pause before searching', async () => {
      vi.mocked(SearchObjects).mockResolvedValue([]);
      await open();

      await filter('r');
      await filter('re');
      await filter('rep');
      await vi.waitFor(() => expect(SearchObjects).toHaveBeenCalled());

      expect(SearchObjects).toHaveBeenCalledTimes(1);
      expect(SearchObjects).toHaveBeenCalledWith('b', '', 'rep', 2000);
    });

    it('shows a spinner while searching', async () => {
      const pending = deferred<S3Object[]>();
      vi.mocked(SearchObjects).mockReturnValue(pending.promise as never);
      const { container } = await open();

      await filter('report');
      await vi.waitFor(() => expect(container.querySelectorAll('.loading')).toHaveLength(2));

      pending.resolve([]);
      expect(await screen.findByText('0 match(es)')).toBeTruthy();
      expect(container.querySelector('.loading')).toBeNull();
    });

    it('treats a missing result as no matches', async () => {
      vi.mocked(SearchObjects).mockResolvedValue(null as never);
      await open();

      await filter('nothing');

      expect(await screen.findByText('0 match(es)')).toBeTruthy();
      expect(screen.getByText('This folder is empty')).toBeTruthy();
    });

    it('reports a failed search', async () => {
      vi.mocked(SearchObjects).mockRejectedValue('timeout');
      await open();

      await filter('report');

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({ message: 'Search failed: timeout', type: 'error' })
      );
      expect(await screen.findByText('0 match(es)')).toBeTruthy();
    });

    it('ignores a slow response for an older query', async () => {
      const slow = deferred<S3Object[]>();
      vi.mocked(SearchObjects)
        .mockReturnValueOnce(slow.promise as never)
        .mockResolvedValueOnce([file('current.txt')]);
      await open();

      await filter('old');
      await vi.waitFor(() => expect(SearchObjects).toHaveBeenCalledTimes(1));
      await filter('current');
      expect(await screen.findByText('current.txt')).toBeTruthy();

      slow.resolve([file('stale.txt')]);
      await Promise.resolve();

      expect(screen.queryByText('stale.txt')).toBeNull();
      expect(screen.getByText('current.txt')).toBeTruthy();
    });

    it('ignores a late failure for an older query', async () => {
      const slow = deferred<S3Object[]>();
      vi.mocked(SearchObjects)
        .mockReturnValueOnce(slow.promise as never)
        .mockResolvedValueOnce([file('current.txt')]);
      await open();

      await filter('old');
      await vi.waitFor(() => expect(SearchObjects).toHaveBeenCalledTimes(1));
      await filter('current');
      await screen.findByText('current.txt');

      slow.reject('timeout');
      await Promise.resolve();
      await Promise.resolve();

      expect(appState.notification).toBeNull();
      expect(screen.getByText('current.txt')).toBeTruthy();
    });

    it('restores the listing when the filter is cleared', async () => {
      vi.mocked(SearchObjects).mockResolvedValue([file('found.txt')]);
      await open();
      await filter('found');
      await screen.findByText('found.txt');

      await fireEvent.click(screen.getByText('✕'));

      expect(await screen.findByText('a.txt')).toBeTruthy();
      expect(screen.queryByText('found.txt')).toBeNull();
      expect(appState.searchQuery).toBe('');
    });

    it('does not page through the listing while searching', async () => {
      vi.mocked(SearchObjects).mockResolvedValue([file('found.txt')]);
      await open();
      await filter('found');
      await screen.findByText('found.txt');

      appState.hasMore = true;
      await Promise.resolve();

      expect(ListObjects).toHaveBeenCalledTimes(1);
    });
  });

  describe('drag rows onto a folder', () => {
    // testing-library hands the handlers its own DataTransfer, so read it off the event
    function captureTransfer(element: HTMLElement, type: string) {
      const seen: { transfer: DataTransfer | null } = { transfer: null };
      element.addEventListener(type, (e) => { seen.transfer = (e as DragEvent).dataTransfer; }, { once: true });
      return seen;
    }

    async function drag(name: string) {
      const seen = captureTransfer(row(name), 'dragstart');
      await fireEvent.dragStart(row(name), { dataTransfer: {} });
      return seen.transfer!;
    }

    it('moves the dragged file into the folder', async () => {
      await open();

      const dataTransfer = await drag('a.txt');
      expect(dataTransfer.effectAllowed).toBe('move');
      expect(dataTransfer.getData('text/plain')).toBe('a.txt');
      expect(row('a.txt').className).toContain('opacity-50');

      const over = captureTransfer(row('docs'), 'dragover');
      await fireEvent.dragOver(row('docs'), { dataTransfer: {} });
      expect(over.transfer!.dropEffect).toBe('move');
      expect(row('docs').className).toContain('drop-target-row');

      await fireEvent.drop(row('docs'));
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(MoveObject).toHaveBeenCalledWith('b', 'a.txt', 'b', 'docs/a.txt');
      expect(appState.notification).toEqual({ message: 'Moved 1 item(s) to "docs"', type: 'success' });
      expect(appState.refreshTrigger).toBeGreaterThan(0);
      expect(row('docs').className).not.toContain('drop-target-row');
    });

    it('moves the whole selection when a selected row is dragged', async () => {
      await open([folder('docs/'), folder('img/'), file('a.txt'), file('b.txt')]);
      await ctrlClick('a.txt');
      await ctrlClick('img');
      appState.clipboard = { operation: 'copy', bucket: 'b', keys: ['a.txt'] };
      appState.propertiesTarget = { bucket: 'b', key: 'a.txt', name: 'a.txt' };

      await drag('a.txt');
      await fireEvent.drop(row('docs'));
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(MoveObject).toHaveBeenCalledWith('b', 'a.txt', 'b', 'docs/a.txt');
      expect(MoveFolder).toHaveBeenCalledWith('b', 'img/', 'b', 'docs/img/');
      expect(appState.notification).toEqual({ message: 'Moved 2 item(s) to "docs"', type: 'success' });
      // Moved objects are gone from where the clipboard and the panel knew them
      expect(selected()).toEqual([]);
      expect(appState.clipboard).toBeNull();
      expect(appState.propertiesTarget).toBeNull();
    });

    it('drags only the grabbed row when it is not part of the selection', async () => {
      await open();
      await ctrlClick('b.txt');

      await drag('a.txt');
      await fireEvent.drop(row('docs'));
      await vi.waitFor(() => expect(MoveObject).toHaveBeenCalledTimes(1));

      expect(MoveObject).toHaveBeenCalledWith('b', 'a.txt', 'b', 'docs/a.txt');
    });

    it('does not accept a folder dropped on itself or a drop on a file', async () => {
      await open();
      await drag('docs');

      await fireEvent.dragOver(row('docs'));
      expect(row('docs').className).not.toContain('drop-target-row');
      await fireEvent.drop(row('docs'));
      await fireEvent.dragOver(row('a.txt'));
      await fireEvent.drop(row('a.txt'));

      expect(MoveFolder).not.toHaveBeenCalled();
      expect(MoveObject).not.toHaveBeenCalled();
    });

    it('ignores drags that did not start in the table', async () => {
      await open();

      // Files from the OS are handled by the Wails runtime, not by these handlers
      await fireEvent.dragOver(row('docs'));
      await fireEvent.drop(row('docs'));

      expect(row('docs').className).not.toContain('drop-target-row');
      expect(MoveObject).not.toHaveBeenCalled();
    });

    it('clears the highlight when the drag leaves the folder or ends', async () => {
      await open([folder('docs/'), folder('img/'), file('a.txt')]);
      await drag('a.txt');

      await fireEvent.dragOver(row('docs'));
      // Leaving a row that is not highlighted changes nothing
      await fireEvent.dragLeave(row('img'));
      expect(row('docs').className).toContain('drop-target-row');
      await fireEvent.dragLeave(row('docs'));
      expect(row('docs').className).not.toContain('drop-target-row');

      await fireEvent.dragOver(row('docs'));
      await fireEvent.dragEnd(row('a.txt'));
      expect(row('docs').className).not.toContain('drop-target-row');
      expect(row('a.txt').className).not.toContain('opacity-50');

      // The drag is over: a late drop moves nothing
      await fireEvent.drop(row('docs'));
      expect(MoveObject).not.toHaveBeenCalled();
    });

    it('warns when only some items could be moved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(MoveObject).mockResolvedValueOnce(undefined).mockRejectedValueOnce('denied');
      await open();
      await ctrlClick('a.txt');
      await ctrlClick('b.txt');

      await drag('a.txt');
      await fireEvent.drop(row('docs'));

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({
          message: 'Moved 1 item(s) to "docs", 1 failed',
          type: 'warning',
        })
      );
    });

    it('reports when nothing could be moved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(MoveObject).mockRejectedValue('denied');
      await open();

      await drag('a.txt');
      await fireEvent.drop(row('docs'));

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({
          message: 'Move failed for all 1 item(s)',
          type: 'error',
        })
      );
    });
  });

  describe('files dropped from the OS', () => {
    it('marks the list and every folder row as drop targets', async () => {
      const { container } = await open();

      expect(container.querySelector('[role="region"][data-file-drop-target]')).toBeTruthy();
      expect(row('docs').getAttribute('data-drop-prefix')).toBe('docs/');
      expect(row('docs').hasAttribute('data-file-drop-target')).toBe(true);
      expect(row('a.txt').hasAttribute('data-file-drop-target')).toBe(false);
    });

    it('uploads into the current folder', async () => {
      appState.currentPrefix = 'docs/';
      await open();

      emitEvent('files:dropped', { paths: ['C:\\Users\\me\\report.pdf'], prefix: '' });
      await vi.waitFor(() => expect(appState.notification).not.toBeNull());

      expect(UploadFiles).toHaveBeenCalledWith('b', 'docs/', ['C:\\Users\\me\\report.pdf']);
      expect(appState.notification).toEqual({ message: 'Uploaded "report.pdf"', type: 'success' });
      expect(appState.refreshTrigger).toBeGreaterThan(0);
    });

    it('uploads into the folder the files were dropped on', async () => {
      await open();

      emitEvent('files:dropped', { paths: ['/home/me/a.jpg', '/home/me/trip'], prefix: 'docs/' });
      await vi.waitFor(() => expect(UploadFiles).toHaveBeenCalled());

      expect(UploadFiles).toHaveBeenCalledWith('b', 'docs/', ['/home/me/a.jpg', '/home/me/trip']);
      expect(appState.uploadBatch).toEqual({ total: 2, done: 0, errors: 0 });
    });

    it('reports a failed upload and drops the batch', async () => {
      vi.mocked(UploadFiles).mockRejectedValue('disk error');
      await open();

      emitEvent('files:dropped', { paths: ['/a.txt', '/b.txt'], prefix: '' });

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({ message: 'Upload failed: disk error', type: 'error' })
      );
      expect(appState.uploadBatch).toBeNull();
    });

    it('asks for a bucket first', async () => {
      render(FileExplorer);

      emitEvent('files:dropped', { paths: ['/a.txt'], prefix: '' });

      expect(appState.notification).toEqual({ message: 'Select a bucket first', type: 'error' });
      expect(UploadFiles).not.toHaveBeenCalled();
    });

    it('ignores a drop without files', async () => {
      await open();

      emitEvent('files:dropped', { paths: null, prefix: '' });
      emitEvent('files:dropped', { paths: [], prefix: '' });

      expect(UploadFiles).not.toHaveBeenCalled();
    });

    it('stops listening when the explorer goes away', async () => {
      const { unmount } = await open();
      const { Events } = await import('@wailsio/runtime');
      const remove = vi.mocked(Events.On).mock.results[0].value;

      unmount();

      expect(remove).toHaveBeenCalledOnce();
    });
  });
});
