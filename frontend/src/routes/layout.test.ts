import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { appState } from '$lib/stores/appState.svelte';
import Layout from './+layout.svelte';
import * as layoutOptions from './+layout';

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/') } }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

const children = createRawSnippet(() => ({ render: () => '<p>page content</p>' }));

function setScreenHeight(height: number) {
  Object.defineProperty(window.screen, 'availHeight', { value: height, configurable: true });
}

describe('+layout', () => {
  afterEach(() => {
    document.documentElement.style.fontSize = '';
  });

  it('is a client-only, prerendered single page', () => {
    expect(layoutOptions.ssr).toBe(false);
    expect(layoutOptions.prerender).toBe(true);
  });

  it('renders the page and a hidden link per locale', () => {
    const { container } = render(Layout, { children });

    expect(screen.getByText('page content')).toBeTruthy();
    const links = [...container.querySelectorAll('[aria-hidden="true"] a')];
    expect(links.map((a) => a.textContent).sort()).toEqual(['en', 'es']);
  });

  it('applies the theme and follows changes', async () => {
    render(Layout, { children });
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');

    appState.settings.theme = 'light';
    await tick();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it.each([
    [720, '16px'],
    [1080, '16px'],
    [1350, '20px'],
    [2160, '22px'],
  ])('scales the font for a %dpx tall screen to %s', (height, fontSize) => {
    setScreenHeight(height);
    render(Layout, { children });
    expect(document.documentElement.style.fontSize).toBe(fontSize);
  });

  it('rescales on resize until unmounted', () => {
    setScreenHeight(1080);
    const { unmount } = render(Layout, { children });

    setScreenHeight(2160);
    window.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.fontSize).toBe('22px');

    unmount();
    setScreenHeight(1080);
    window.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.fontSize).toBe('22px');
  });
});
