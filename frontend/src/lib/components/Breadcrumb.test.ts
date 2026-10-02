import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { appState } from '$lib/stores/appState.svelte';
import { file } from '../../test/helpers';
import Breadcrumb from './Breadcrumb.svelte';

const crumbNames = () => screen.getAllByRole('button').map((b) => b.textContent?.trim());

describe('Breadcrumb', () => {
  it('shows a placeholder without a bucket', () => {
    render(Breadcrumb);
    expect(screen.getByText('No bucket selected')).toBeTruthy();
  });

  it('shows only the bucket at the root', () => {
    appState.currentBucket = 'photos';
    render(Breadcrumb);
    expect(crumbNames()).toEqual(['photos']);
  });

  it('shows one crumb per folder', () => {
    appState.currentBucket = 'photos';
    appState.currentPrefix = '2025/summer/';
    render(Breadcrumb);
    expect(crumbNames()).toEqual(['photos', '2025', 'summer']);
  });

  it('collapses deep paths to bucket, ellipsis and the last two folders', () => {
    appState.currentBucket = 'photos';
    appState.currentPrefix = 'a/b/c/d/';
    render(Breadcrumb);
    expect(crumbNames()).toEqual(['photos', 'c', 'd']);
    expect(screen.getByText('…')).toBeTruthy();
  });

  it('navigates to a parent folder and resets the listing', async () => {
    appState.currentBucket = 'photos';
    appState.currentPrefix = '2025/summer/';
    appState.objects = [file('2025/summer/a.jpg')];
    appState.continuationToken = 'token';
    appState.selectedKeys = new Set(['2025/summer/a.jpg']);
    render(Breadcrumb);

    await fireEvent.click(screen.getByRole('button', { name: '2025' }));

    expect(appState.currentPrefix).toBe('2025/');
    expect(appState.objects).toEqual([]);
    expect(appState.continuationToken).toBe('');
    expect(appState.selectedKeys.size).toBe(0);
  });

  it('navigates to the bucket root', async () => {
    appState.currentBucket = 'photos';
    appState.currentPrefix = '2025/';
    render(Breadcrumb);

    await fireEvent.click(screen.getByRole('button', { name: 'photos' }));

    expect(appState.currentPrefix).toBe('');
  });

  it('does nothing when the current folder is clicked', async () => {
    appState.currentBucket = 'photos';
    appState.currentPrefix = '2025/';
    appState.objects = [file('2025/a.jpg')];
    render(Breadcrumb);

    await fireEvent.click(screen.getByRole('button', { name: '2025' }));

    expect(appState.objects).toHaveLength(1);
  });
});
