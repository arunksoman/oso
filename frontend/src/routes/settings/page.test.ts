import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SettingsPage from './+page.svelte';

describe('/settings', () => {
  it('renders the settings window', async () => {
    render(SettingsPage);

    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeTruthy();
    expect(await screen.findByText('Downloads')).toBeTruthy();
  });
});
