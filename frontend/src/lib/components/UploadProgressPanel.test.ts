import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { appState } from '$lib/stores/appState.svelte';
import UploadProgressPanel from './UploadProgressPanel.svelte';

describe('UploadProgressPanel', () => {
  it('renders nothing without uploads', () => {
    const { container } = render(UploadProgressPanel);
    expect(container.querySelector('.fixed')).toBeNull();
  });

  describe('single files', () => {
    it('shows progress and the number of active uploads', () => {
      appState.uploads = {
        'docs/a.txt': { key: 'docs/a.txt', progress: 41.6, done: false },
        'docs/b.txt': { key: 'docs/b.txt', progress: 100, done: true },
      };
      const { container } = render(UploadProgressPanel);

      expect(screen.getByText('a.txt')).toBeTruthy();
      expect(screen.getByText('42%')).toBeTruthy();
      expect(screen.getByText('✓')).toBeTruthy();
      expect(container.querySelector('.badge')?.textContent).toBe('1');
      expect(container.querySelectorAll('progress')).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    });

    it('shows the error for a failed upload', () => {
      appState.uploads = {
        'a.txt': { key: 'a.txt', progress: 0, done: false, error: 'access denied' },
      };
      render(UploadProgressPanel);

      expect(screen.getByText('✗')).toBeTruthy();
      expect(screen.getByText('access denied')).toBeTruthy();
    });

    it('can be cleared once nothing is active', async () => {
      appState.uploads = { 'a.txt': { key: 'a.txt', progress: 100, done: true } };
      const { container } = render(UploadProgressPanel);

      await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

      expect(appState.uploads).toEqual({});
      expect(container.querySelector('.fixed')).toBeNull();
    });
  });

  describe('batch', () => {
    it('shows which file is uploading', () => {
      appState.uploadBatch = { total: 5, done: 1, errors: 0 };
      const { container } = render(UploadProgressPanel);

      expect(screen.getByText('Uploading 2 of 5…')).toBeTruthy();
      expect(screen.getByText('20%')).toBeTruthy();
      expect(container.querySelector('progress')?.className).toContain('progress-primary');
    });

    it('takes priority over single file entries', () => {
      appState.uploadBatch = { total: 2, done: 0, errors: 0 };
      appState.uploads = { 'a.txt': { key: 'a.txt', progress: 10, done: false } };
      render(UploadProgressPanel);

      expect(screen.queryByText('Uploads')).toBeNull();
    });

    it('reports success when every file is done', () => {
      appState.uploadBatch = { total: 5, done: 5, errors: 0 };
      const { container } = render(UploadProgressPanel);

      expect(screen.getByText('5 of 5 files uploaded')).toBeTruthy();
      expect(container.querySelector('progress')?.className).toContain('progress-success');
    });

    it('reports failures when the batch finishes with errors', () => {
      appState.uploadBatch = { total: 5, done: 3, errors: 2 };
      const { container } = render(UploadProgressPanel);

      expect(screen.getByText('3 uploaded, 2 failed')).toBeTruthy();
      expect(container.querySelector('progress')?.className).toContain('progress-warning');
    });
  });
});
