import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import {
  DeleteProfile,
  Disconnect,
  ListProfiles,
  SaveProfile,
  SwitchProfile,
  TestConnection,
} from '$bindings/oso/app';
import { appState } from '$lib/stores/appState.svelte';
import { deferred, profile } from '../../../test/helpers';
import ConnectionsSection from './ConnectionsSection.svelte';

const work = profile('work', { name: 'Work' });
const home = profile('home', { name: 'Home', region: 'eu-west-1' });
const env = profile('env', { name: 'Environment', readOnly: true });

function open(profiles = [work, home], activeId = 'work') {
  appState.profiles = profiles;
  appState.activeProfileId = activeId;
  appState.connected = activeId !== '';
  vi.mocked(ListProfiles).mockResolvedValue(profiles);
  return render(ConnectionsSection);
}

const item = (name: string) => within(screen.getByRole('listitem', { name }));
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const setValue = (label: string, value: string) => fireEvent.input(field(label), { target: { value } });

async function fillNew(values: Record<string, string>) {
  await fireEvent.click(screen.getByRole('button', { name: 'New connection' }));
  for (const [label, value] of Object.entries(values)) await setValue(label, value);
}

const valid = {
  Name: 'Staging',
  'Endpoint URL': 'http://staging:9000',
  'Access Key': 'key',
  'Secret Key': 'secret',
};

describe('ConnectionsSection', () => {
  describe('list', () => {
    it('lists the profiles and marks the active one', () => {
      open();

      expect(item('Work').getByText('Active')).toBeTruthy();
      expect(item('Work').getByText('http://work.example.com:9000 · us-east-1')).toBeTruthy();
      expect(item('Home').queryByText('Active')).toBeNull();
      expect(item('Home').getByText(/eu-west-1/)).toBeTruthy();
      expect(item('Work').getByRole('button', { name: 'Disconnect' })).toBeTruthy();
      expect(item('Home').getByRole('button', { name: 'Connect' })).toBeTruthy();
    });

    it('shows an empty state', () => {
      open([], '');
      expect(screen.getByText('No saved connections yet')).toBeTruthy();
    });

    it('does not offer to edit or delete the environment profile', () => {
      open([env, work], 'env');

      expect(item('Environment').getByText('Set through S3_* environment variables')).toBeTruthy();
      expect(item('Environment').queryByTitle(/Edit/)).toBeNull();
      expect(item('Environment').queryByTitle(/Delete/)).toBeNull();
      expect(item('Work').getByTitle('Edit Work')).toBeTruthy();
    });
  });

  describe('switching', () => {
    it('connects to another profile', async () => {
      open();

      await fireEvent.click(item('Home').getByRole('button', { name: 'Connect' }));
      await vi.waitFor(() => expect(appState.activeProfileId).toBe('home'));

      expect(SwitchProfile).toHaveBeenCalledWith('home');
      expect(appState.notification).toEqual({ message: 'Connected to "Home"', type: 'success' });
      expect(item('Home').getByText('Active')).toBeTruthy();
    });

    it('keeps the current connection when the switch fails', async () => {
      vi.mocked(SwitchProfile).mockRejectedValue('connection failed: access denied');
      open();

      await fireEvent.click(item('Home').getByRole('button', { name: 'Connect' }));

      await vi.waitFor(() =>
        expect(appState.notification).toEqual({ message: 'connection failed: access denied', type: 'error' }),
      );
      expect(appState.activeProfileId).toBe('work');
    });

    it('shows a spinner and blocks other switches while connecting', async () => {
      const pending = deferred<void>();
      vi.mocked(SwitchProfile).mockReturnValue(pending.promise as never);
      open([work, home, profile('lab', { name: 'Lab' })]);

      await fireEvent.click(item('Home').getByRole('button', { name: 'Connect' }));

      await vi.waitFor(() => expect(item('Home').getByRole<HTMLButtonElement>('button', { name: 'Connect' }).disabled).toBe(true));
      expect(item('Home').getByRole('button', { name: 'Connect' }).querySelector('.loading')).toBeTruthy();
      expect(item('Lab').getByRole<HTMLButtonElement>('button', { name: 'Connect' }).disabled).toBe(true);
      pending.resolve();
      await vi.waitFor(() => expect(appState.activeProfileId).toBe('home'));
    });

    it('disconnects the active profile', async () => {
      open();

      await fireEvent.click(item('Work').getByRole('button', { name: 'Disconnect' }));
      await vi.waitFor(() => expect(appState.connected).toBe(false));

      expect(Disconnect).toHaveBeenCalledOnce();
      expect(appState.activeProfileId).toBe('');
    });

    it('reports a failed disconnect', async () => {
      vi.mocked(Disconnect).mockRejectedValue('backend gone');
      open();

      await fireEvent.click(item('Work').getByRole('button', { name: 'Disconnect' }));

      await vi.waitFor(() => expect(appState.notification).toEqual({ message: 'backend gone', type: 'error' }));
      expect(appState.connected).toBe(true);
    });
  });

  describe('deleting', () => {
    it('asks before deleting and can keep the profile', async () => {
      open();

      await fireEvent.click(item('Home').getByTitle('Delete Home'));
      expect(item('Home').getByText('Delete?')).toBeTruthy();

      await fireEvent.click(item('Home').getByRole('button', { name: 'Keep' }));
      expect(item('Home').queryByText('Delete?')).toBeNull();
      expect(DeleteProfile).not.toHaveBeenCalled();
    });

    it('deletes a profile and reloads the list', async () => {
      open();
      vi.mocked(ListProfiles).mockResolvedValue([work]);
      await fireEvent.click(item('Home').getByTitle('Delete Home'));

      await fireEvent.click(item('Home').getByRole('button', { name: 'Delete' }));
      await vi.waitFor(() => expect(screen.queryByRole('listitem', { name: 'Home' })).toBeNull());

      expect(DeleteProfile).toHaveBeenCalledWith('home');
      expect(appState.notification).toEqual({ message: 'Connection "Home" deleted', type: 'success' });
      expect(appState.connected).toBe(true);
    });

    it('disconnects when the active profile is deleted and closes its editor', async () => {
      open();
      await fireEvent.click(item('Work').getByTitle('Edit Work'));
      vi.mocked(ListProfiles).mockResolvedValue([home]);
      await fireEvent.click(item('Work').getByTitle('Delete Work'));

      await fireEvent.click(item('Work').getByRole('button', { name: 'Delete' }));
      await vi.waitFor(() => expect(appState.connected).toBe(false));

      expect(appState.activeProfileId).toBe('');
      await vi.waitFor(() => expect(screen.queryByText('Edit connection')).toBeNull());
    });

    it('reports a failed delete', async () => {
      vi.mocked(DeleteProfile).mockRejectedValue('profile not found');
      open();
      await fireEvent.click(item('Home').getByTitle('Delete Home'));

      await fireEvent.click(item('Home').getByRole('button', { name: 'Delete' }));

      await vi.waitFor(() => expect(appState.notification).toEqual({ message: 'profile not found', type: 'error' }));
      expect(item('Home').queryByText('Delete?')).toBeNull();
    });
  });

  describe('editor', () => {
    it('opens empty for a new connection', async () => {
      open();

      await fireEvent.click(screen.getByRole('button', { name: 'New connection' }));

      expect(screen.getByText('New connection', { selector: 'p' })).toBeTruthy();
      expect(field('Name').value).toBe('');
      expect(field('Region').value).toBe('us-east-1');
    });

    it('requires endpoint and keys', async () => {
      open();
      await fillNew({ Name: 'Staging' });

      await fireEvent.submit(field('Name').closest('form')!);

      expect(screen.getByText('Endpoint, Access Key and Secret Key are required')).toBeTruthy();
      expect(SaveProfile).not.toHaveBeenCalled();

      await fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
      expect(TestConnection).not.toHaveBeenCalled();
    });

    it('saves a new connection', async () => {
      open();
      await fillNew(valid);
      const saved = profile('staging', { name: 'Staging' });
      vi.mocked(SaveProfile).mockResolvedValue(saved);
      vi.mocked(ListProfiles).mockResolvedValue([work, home, saved]);

      await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await vi.waitFor(() => expect(screen.getByRole('listitem', { name: 'Staging' })).toBeTruthy());

      expect(SaveProfile).toHaveBeenCalledWith({
        id: '',
        name: 'Staging',
        endpoint: 'http://staging:9000',
        accessKey: 'key',
        secretKey: 'secret',
        region: 'us-east-1',
        readOnly: false,
      });
      expect(appState.notification).toEqual({ message: 'Connection "Staging" saved', type: 'success' });
      expect(screen.queryByLabelText('Endpoint URL')).toBeNull();
    });

    it('edits an existing connection', async () => {
      open();

      await fireEvent.click(item('Home').getByTitle('Edit Home'));
      expect(screen.getByText('Edit connection')).toBeTruthy();
      expect(field('Endpoint URL').value).toBe('http://home.example.com:9000');
      await setValue('Name', 'Home lab');

      await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await vi.waitFor(() =>
        expect(SaveProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'home', name: 'Home lab' })),
      );
      // The backend answer is missing here, so the typed name is reported
      await vi.waitFor(() =>
        expect(appState.notification).toEqual({ message: 'Connection "Home lab" saved', type: 'success' }),
      );
    });

    it('shows a save failure in the form', async () => {
      vi.mocked(SaveProfile).mockRejectedValue('connection failed: bad credentials');
      open();
      await fillNew(valid);

      await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('connection failed: bad credentials')).toBeTruthy();
      expect(field('Endpoint URL')).toBeTruthy();
    });

    it('tests the connection without saving it', async () => {
      open();
      await fillNew({ ...valid, 'Endpoint URL': ' http://staging:9000 ', Region: ' eu-west-1 ' });

      await fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

      expect(await screen.findByText('Connection works')).toBeTruthy();
      expect(TestConnection).toHaveBeenCalledWith({
        endpoint: 'http://staging:9000',
        accessKey: 'key',
        secretKey: 'secret',
        region: 'eu-west-1',
      });
      expect(SaveProfile).not.toHaveBeenCalled();
    });

    it('shows why a connection test failed', async () => {
      const pending = deferred<void>();
      vi.mocked(TestConnection).mockReturnValue(pending.promise as never);
      open();
      await fillNew(valid);
      const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Test connection' });

      await fireEvent.click(button);
      await vi.waitFor(() => expect(button.disabled).toBe(true));

      pending.reject('connection failed: timeout');
      expect(await screen.findByText('connection failed: timeout')).toBeTruthy();
      expect(screen.queryByText('Connection works')).toBeNull();
    });

    it('shows and hides the secret key', async () => {
      open();
      await fillNew(valid);
      expect(field('Secret Key').type).toBe('password');

      await fireEvent.click(screen.getByTitle('Show secret key'));
      expect(field('Secret Key').type).toBe('text');

      await fireEvent.click(screen.getByTitle('Hide secret key'));
      expect(field('Secret Key').type).toBe('password');
    });

    it('closes on cancel without saving', async () => {
      open();
      await fillNew(valid);

      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByLabelText('Endpoint URL')).toBeNull();
      expect(SaveProfile).not.toHaveBeenCalled();
    });
  });
});
