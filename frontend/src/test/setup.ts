import { afterEach, beforeEach, vi } from 'vitest';
import * as bindings from '$bindings/oso/app';
import { Window } from '@wailsio/runtime';
import { resetAppState } from './helpers';

// Every Go binding becomes a vi.fn(); tests set the results they need
vi.mock('$bindings/oso/app');

// The real runtime talks to the Wails host at import time, so replace it whole
vi.mock('@wailsio/runtime', () => ({
  Call: { ByID: vi.fn() },
  CancellablePromise: Promise,
  Create: { Any: (value: unknown) => value },
  Window: { IsMaximised: vi.fn(), ToggleMaximise: vi.fn(), Minimise: vi.fn() },
  Application: { Quit: vi.fn() },
  Events: { On: vi.fn() },
}));

// Timers a test leaves behind (toast auto-dismiss, upload cleanup) would fire
// during a later test and change shared state, so cancel them after each test.
const leftoverTimers = new Set<ReturnType<typeof setTimeout>>();
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((handler: () => void, delay?: number) => {
  const id = realSetTimeout(() => {
    leftoverTimers.delete(id);
    handler();
  }, delay);
  leftoverTimers.add(id);
  return id;
}) as typeof setTimeout;

afterEach(() => {
  for (const id of leftoverTimers) clearTimeout(id);
  leftoverTimers.clear();
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const binding of Object.values(bindings)) {
    if (vi.isMockFunction(binding)) binding.mockReset().mockResolvedValue(undefined);
  }
  vi.mocked(Window.IsMaximised).mockReset().mockResolvedValue(false);
  vi.mocked(Window.ToggleMaximise).mockReset().mockResolvedValue(undefined);
  resetAppState();
  document.documentElement.removeAttribute('data-theme');
});
