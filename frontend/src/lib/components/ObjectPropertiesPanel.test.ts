import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { GetObjectProperties, UpdateObjectProperties } from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import type { ObjectProperties } from '$lib/stores/appState.svelte';
import { deferred } from '../../test/helpers';
import ObjectPropertiesPanel from './ObjectPropertiesPanel.svelte';

function properties(overrides: Partial<ObjectProperties> = {}): ObjectProperties {
  return {
    bucket: 'b',
    key: 'docs/report.pdf',
    size: 2048,
    lastModified: '2026-01-02T03:04:05Z',
    contentType: 'application/pdf',
    etag: 'abc123',
    storageClass: 'STANDARD',
    versionId: '',
    cacheControl: '',
    contentDisposition: '',
    contentEncoding: '',
    metadata: { author: 'ada' },
    tags: { team: 'finance' },
    ...overrides,
  };
}

async function open(loaded: ObjectProperties = properties()) {
  vi.mocked(GetObjectProperties).mockResolvedValue(loaded);
  appState.currentBucket = 'b';
  appState.propertiesTarget = { bucket: 'b', key: 'docs/report.pdf', name: 'report.pdf' };
  const view = render(ObjectPropertiesPanel);
  await screen.findByLabelText('Content-Type');
  return view;
}

const contentType = () => screen.getByLabelText<HTMLInputElement>('Content-Type');
const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });
const setValue = (input: HTMLElement, value: string) => fireEvent.input(input, { target: { value } });

describe('ObjectPropertiesPanel', () => {
  it('renders nothing without a target', () => {
    render(ObjectPropertiesPanel);
    expect(screen.queryByLabelText('Object properties')).toBeNull();
    expect(GetObjectProperties).not.toHaveBeenCalled();
  });

  it('shows the details, metadata and tags of the object', async () => {
    await open();

    expect(GetObjectProperties).toHaveBeenCalledWith('b', 'docs/report.pdf');
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(screen.getByText('s3://b/docs/report.pdf')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('STANDARD')).toBeTruthy();
    expect(screen.getByText('abc123')).toBeTruthy();
    expect(contentType().value).toBe('application/pdf');
    expect(screen.getByLabelText<HTMLInputElement>('Metadata key 1').value).toBe('author');
    expect(screen.getByLabelText<HTMLInputElement>('Metadata value 1').value).toBe('ada');
    expect(screen.getByText('team')).toBeTruthy();
    expect(screen.getByText('finance')).toBeTruthy();
    expect(screen.queryByText('Version')).toBeNull();
  });

  it('shows the optional headers when the object has them', async () => {
    await open(
      properties({
        versionId: 'v-42',
        cacheControl: 'max-age=60',
        contentDisposition: 'attachment',
        contentEncoding: 'gzip',
        metadata: {},
        tags: {},
      }),
    );

    expect(screen.getByText('v-42')).toBeTruthy();
    expect(screen.getByText('max-age=60')).toBeTruthy();
    expect(screen.getByText('attachment')).toBeTruthy();
    expect(screen.getByText('gzip')).toBeTruthy();
    expect(screen.getByText('No user metadata')).toBeTruthy();
    expect(screen.getByText('No tags')).toBeTruthy();
  });

  it('shows a spinner while loading', async () => {
    const pending = deferred<ObjectProperties>();
    vi.mocked(GetObjectProperties).mockReturnValue(pending.promise as never);
    appState.currentBucket = 'b';
    appState.propertiesTarget = { bucket: 'b', key: 'a.txt', name: 'a.txt' };
    const { container } = render(ObjectPropertiesPanel);

    await vi.waitFor(() => expect(container.querySelector('.loading')).toBeTruthy());

    pending.resolve(properties());
    expect(await screen.findByLabelText('Content-Type')).toBeTruthy();
  });

  it.each([
    ['a rejected request', () => vi.mocked(GetObjectProperties).mockRejectedValue('NotFound'), 'NotFound'],
    ['a missing object', () => vi.mocked(GetObjectProperties).mockResolvedValue(null), /object not found/],
  ])('reports %s', async (_, arrange, message) => {
    arrange();
    appState.currentBucket = 'b';
    appState.propertiesTarget = { bucket: 'b', key: 'gone.txt', name: 'gone.txt' };
    render(ObjectPropertiesPanel);

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByLabelText('Content-Type')).toBeNull();
  });

  it('ignores a slow response for an object that is no longer shown', async () => {
    const slow = deferred<ObjectProperties>();
    vi.mocked(GetObjectProperties).mockReturnValueOnce(slow.promise as never);
    appState.currentBucket = 'b';
    appState.propertiesTarget = { bucket: 'b', key: 'old.txt', name: 'old.txt' };
    render(ObjectPropertiesPanel);
    await vi.waitFor(() => expect(GetObjectProperties).toHaveBeenCalledTimes(1));

    vi.mocked(GetObjectProperties).mockResolvedValue(properties({ contentType: 'image/png' }));
    appState.propertiesTarget = { bucket: 'b', key: 'new.png', name: 'new.png' };
    await vi.waitFor(() => expect(contentType().value).toBe('image/png'));

    slow.resolve(properties({ contentType: 'text/stale' }));
    await tick();
    expect(contentType().value).toBe('image/png');
  });

  it('ignores a late failure for an object that is no longer shown', async () => {
    const slow = deferred<ObjectProperties>();
    vi.mocked(GetObjectProperties).mockReturnValueOnce(slow.promise as never);
    appState.currentBucket = 'b';
    appState.propertiesTarget = { bucket: 'b', key: 'old.txt', name: 'old.txt' };
    render(ObjectPropertiesPanel);
    await vi.waitFor(() => expect(GetObjectProperties).toHaveBeenCalledTimes(1));

    vi.mocked(GetObjectProperties).mockResolvedValue(properties());
    appState.propertiesTarget = { bucket: 'b', key: 'new.pdf', name: 'new.pdf' };
    await screen.findByLabelText('Content-Type');

    slow.reject('timeout');
    await tick();
    expect(screen.queryByText('timeout')).toBeNull();
  });

  it('enables save only after a change and resets it', async () => {
    await open();
    expect(saveButton().disabled).toBe(true);

    await setValue(contentType(), 'text/plain');
    expect(saveButton().disabled).toBe(false);

    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(contentType().value).toBe('application/pdf');
    expect(saveButton().disabled).toBe(true);
  });

  it('saves the content type and metadata, then reloads', async () => {
    await open();
    await setValue(contentType(), ' text/plain ');
    await setValue(screen.getByLabelText('Metadata value 1'), 'grace');
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await setValue(screen.getByLabelText('Metadata key 2'), ' Reviewed-By ');
    await setValue(screen.getByLabelText('Metadata value 2'), 'linus');
    vi.mocked(GetObjectProperties).mockResolvedValue(
      properties({ contentType: 'text/plain', metadata: { author: 'grace', 'reviewed-by': 'linus' } }),
    );

    await fireEvent.click(saveButton());
    await vi.waitFor(() => expect(GetObjectProperties).toHaveBeenCalledTimes(2));

    expect(UpdateObjectProperties).toHaveBeenCalledWith('b', 'docs/report.pdf', 'text/plain', {
      author: 'grace',
      'reviewed-by': 'linus',
    });
    expect(appState.notification).toEqual({ message: 'Updated "report.pdf"', type: 'success' });
    expect(appState.refreshTrigger).toBeGreaterThan(0);
    await vi.waitFor(() => expect(saveButton().disabled).toBe(true));
  });

  it('removes a metadata entry', async () => {
    await open();

    await fireEvent.click(screen.getByTitle('Remove metadata 1'));
    expect(screen.getByText('No user metadata')).toBeTruthy();

    await fireEvent.click(saveButton());
    await vi.waitFor(() =>
      expect(UpdateObjectProperties).toHaveBeenCalledWith('b', 'docs/report.pdf', 'application/pdf', {}),
    );
  });

  it.each([
    ['', 'Metadata keys must not be empty'],
    ['two words', '"two words" is not a valid metadata key'],
    ['a:b', '"a:b" is not a valid metadata key'],
    ['Author', '"author" is used twice'],
  ])('rejects the metadata key "%s"', async (key, message) => {
    await open();
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await setValue(screen.getByLabelText('Metadata key 2'), key);

    expect(screen.getByText(message)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('reports a failed update and keeps the edits', async () => {
    vi.mocked(UpdateObjectProperties).mockRejectedValue('objects larger than 5 GiB cannot be edited in place');
    await open();
    await setValue(contentType(), 'text/plain');

    await fireEvent.click(saveButton());

    await vi.waitFor(() =>
      expect(appState.notification).toEqual({
        message: 'Update failed: objects larger than 5 GiB cannot be edited in place',
        type: 'error',
      }),
    );
    expect(contentType().value).toBe('text/plain');
    expect(saveButton().disabled).toBe(false);
  });

  it('reloads on request', async () => {
    await open();

    await fireEvent.click(screen.getByTitle('Reload properties'));

    await vi.waitFor(() => expect(GetObjectProperties).toHaveBeenCalledTimes(2));
  });

  it('closes from its header', async () => {
    await open();

    await fireEvent.click(screen.getByTitle('Close properties'));

    expect(appState.propertiesTarget).toBeNull();
    await vi.waitFor(() => expect(screen.queryByLabelText('Object properties')).toBeNull());
  });

  it('closes when another bucket is opened', async () => {
    await open();

    appState.currentBucket = 'other';

    await vi.waitFor(() => expect(appState.propertiesTarget).toBeNull());
  });
});
