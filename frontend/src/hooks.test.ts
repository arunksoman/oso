import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { reroute } from './hooks';
import { handle } from './hooks.server';

type Resolve = Parameters<typeof handle>[0]['resolve'];

describe('reroute', () => {
  it('maps a localized URL back to its route', () => {
    const route = (url: string) => reroute({ url: new URL(url) } as Parameters<typeof reroute>[0]);

    expect(route('http://localhost/')).toBe('/');
    expect(route('http://localhost/es')).toBe('/');
  });
});

describe('handle', () => {
  it('fills in the language and text direction of the page', async () => {
    const event = { request: new Request('http://localhost/') } as RequestEvent;
    let rendered = '';
    const resolve = vi.fn(async (_event, options) => {
      rendered = await options.transformPageChunk({
        html: '<html lang="%paraglide.lang%" dir="%paraglide.dir%">',
        done: true,
      });
      return new Response(rendered);
    }) as unknown as Resolve;

    await handle({ event, resolve });

    expect(rendered).toBe('<html lang="en" dir="ltr">');
    expect(resolve).toHaveBeenCalledOnce();
  });
});
