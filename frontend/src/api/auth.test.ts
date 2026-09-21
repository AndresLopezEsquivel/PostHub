import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSession } from './auth';
import { ApiError } from './client';

// The highest-value test in the scaffold. GET /api/auth/session answers 401 when
// logged out, so "not authenticated" and "the server is broken" arrive through
// the same channel. Conflating them would silently log every user out during an
// outage — and, worse, look like normal behaviour while doing it.

function mockFetch(response: Response) {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response));
}

describe('getSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the user when a session exists', async () => {
    mockFetch(
      new Response(JSON.stringify({ username: 'andres', email: 'andres@example.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(getSession()).resolves.toEqual({
      username: 'andres',
      email: 'andres@example.com',
    });
  });

  it('returns null on 401, the documented logged-out path', async () => {
    mockFetch(
      new Response(JSON.stringify({ error: { message: 'Not authenticated' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(getSession()).resolves.toBeNull();
  });

  it('rethrows a 500 instead of reporting it as anonymous', async () => {
    mockFetch(
      new Response(JSON.stringify({ error: { message: 'Internal server error' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(getSession()).rejects.toBeInstanceOf(ApiError);
  });

  it('rethrows a proxy failure with no envelope', async () => {
    mockFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    await expect(getSession()).rejects.toBeInstanceOf(ApiError);
  });
});
