import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, request } from './client';

// The fetch wrapper is the one module every future pass depends on, so its edges
// are worth pinning down here rather than rediscovering them in a screen.

function mockFetch(response: Response) {
  const spy = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('request', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes /api and returns the parsed body', async () => {
    const fetchSpy = mockFetch(jsonResponse(200, { username: 'andres' }));

    await expect(request('/auth/session')).resolves.toEqual({ username: 'andres' });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/auth/session');
    // The session cookie is the only credential this app has; every authenticated
    // request depends on the browser attaching it.
    expect(init?.credentials).toBe('same-origin');
  });

  it('serializes a body as JSON and sets the content type', async () => {
    const fetchSpy = mockFetch(jsonResponse(201, { id: 1 }));

    await request('/posts', { method: 'POST', body: { title: 'On absurdism' } });

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ title: 'On absurdism' }));
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('drops undefined query params instead of serializing them', async () => {
    const fetchSpy = mockFetch(jsonResponse(200, { data: [], page: 1, limit: 20, total: 0 }));

    // Callers forward optional filters straight through; an absent filter must
    // not become `?category=undefined`, which the backend would treat as a slug.
    await request('/posts', {
      query: { search: 'camus', category: undefined, page: 2, sort: undefined },
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe('/api/posts?search=camus&page=2');
  });

  it('omits the query string entirely when nothing survives filtering', async () => {
    const fetchSpy = mockFetch(jsonResponse(200, {}));

    await request('/posts', { query: { search: undefined } });

    expect(fetchSpy.mock.calls[0]![0]).toBe('/api/posts');
  });

  it('resolves undefined for a 204, which DELETEs and no-op PUTs return', async () => {
    mockFetch(new Response(null, { status: 204 }));

    await expect(request<void>('/posts/42', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('maps the error envelope onto ApiError, carrying status, message and field', async () => {
    mockFetch(jsonResponse(400, { error: { message: 'Title is required', field: 'title' } }));

    const error = await request('/posts', { method: 'POST', body: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      message: 'Title is required',
      field: 'title',
    });
  });

  it('leaves field undefined when the envelope omits it', async () => {
    mockFetch(jsonResponse(403, { error: { message: 'You are not the author of this post' } }));

    const error = (await request('/posts/42', { method: 'PATCH', body: {} }).catch(
      (e: unknown) => e,
    )) as ApiError;

    expect(error.status).toBe(403);
    expect(error.field).toBeUndefined();
  });

  it('still throws an ApiError when the failure body is not our JSON envelope', async () => {
    // nginx answers a 502 with an HTML error page, and a proxy timeout has no
    // body at all. Either must surface as an ApiError the caller can branch on —
    // not as a SyntaxError from JSON.parse.
    mockFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    const error = (await request('/posts').catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.message).toBe('Request failed (502)');
  });
});
