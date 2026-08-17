import { http, HttpResponse } from 'msw';

// Default handlers for the integration project. One resource group is added here
// per pass, mirroring how backend/tests/integration grew a file per controller
// group — so this is the frontend's stand-in for the posthub_test database.
//
// Paths are written with a leading '*' so they match whatever origin jsdom is
// serving from. Client code only ever requests the relative '/api/...' path.
//
// Shapes are transcribed from docs/api_design.md. Keep them exact: a handler that
// returns a shape the real API never would turns a passing test into a lie.

// The anonymous default. GET /api/auth/session answers 401 when there is no
// session — deliberately, so the client's "am I logged in" check and its error
// handling share one path. Individual tests override this with server.use().
export const handlers = [
  http.get('*/api/auth/session', () =>
    HttpResponse.json({ error: { message: 'Not authenticated' } }, { status: 401 }),
  ),

  // POST /api/auth/register — echoes the submitted username/email back as the
  // PublicUser the real API returns (201, session opened server-side). Tests that
  // exercise the taken-username/email branch override this with registerConflict.
  http.post('*/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as { username: string; email: string };
    return HttpResponse.json({ username: body.username, email: body.email }, { status: 201 });
  }),

  // POST /api/auth/login — succeeds by default; loginInvalid overrides for the
  // wrong-credentials path.
  http.post('*/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string };
    return HttpResponse.json({ username: 'andres', email: body.email });
  }),

  // POST /api/auth/logout — 204, no body.
  http.post('*/api/auth/logout', () => new HttpResponse(null, { status: 204 })),

  // GET /api/categories — the bare array (not the envelope), ordered by name.
  http.get('*/api/categories', () => HttpResponse.json(CATEGORIES)),

  // GET /api/posts — a query-aware stand-in for the DB: honours search, category,
  // sort, page, and limit so the integration test exercises real filter/sort/page
  // behaviour through the real client, not just a canned list. limit defaults to a
  // small 2 (the fixture has three posts) so pagination is reachable.
  http.get('*/api/posts', ({ request }) => {
    const p = new URL(request.url).searchParams;
    let items = [...POSTS];

    const search = p.get('search');
    if (search) {
      const needle = search.toLowerCase();
      items = items.filter((x) => `${x.title} ${x.excerpt}`.toLowerCase().includes(needle));
    }
    const category = p.get('category');
    if (category) items = items.filter((x) => x.categories.some((c) => c.slug === category));

    if (p.get('sort') === 'likes') items.sort((a, b) => b.likeCount - a.likeCount);
    else items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const limit = Number(p.get('limit')) || 2;
    const page = Number(p.get('page')) || 1;
    const data = items.slice((page - 1) * limit, (page - 1) * limit + limit);
    return HttpResponse.json({ data, page, limit, total });
  }),
];

// --- Posts / categories fixtures ---------------------------------------------

const CATEGORIES = [
  { id: 1, name: 'Life', slug: 'life' },
  { id: 2, name: 'Tech', slug: 'tech' },
];

function card(overrides: Partial<PostCardFixture> & Pick<PostCardFixture, 'id' | 'title'>): PostCardFixture {
  return {
    excerpt: `Excerpt for ${overrides.title}.`,
    author: { username: 'andres', avatarUrl: null },
    categories: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    bookmarkedByMe: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

interface PostCardFixture {
  id: number;
  title: string;
  excerpt: string;
  author: { username: string; avatarUrl: string | null };
  categories: { name: string; slug: string }[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  createdAt: string;
}

const TECH = { name: 'Tech', slug: 'tech' };
const LIFE = { name: 'Life', slug: 'life' };

// newest order (by createdAt desc): Alpha, Bravo, Charlie.
// most-liked order (by likeCount desc): Bravo, Charlie, Alpha.
const POSTS: PostCardFixture[] = [
  card({ id: 1, title: 'Alpha', categories: [TECH], likeCount: 1, createdAt: '2026-08-03T00:00:00.000Z' }),
  card({ id: 2, title: 'Bravo', categories: [LIFE], likeCount: 5, createdAt: '2026-08-02T00:00:00.000Z' }),
  card({ id: 3, title: 'Charlie', categories: [TECH], likeCount: 3, createdAt: '2026-08-01T00:00:00.000Z' }),
];

// Convenience override for the authenticated case.
export function sessionHandler(user: { username: string; email: string }) {
  return http.get('*/api/auth/session', () => HttpResponse.json(user));
}

// A taken username/email: the backend maps the 23505 unique violation to a 409
// carrying the offending field (see auth.service.ts registerUser).
export function registerConflict(field: 'username' | 'email', message: string) {
  return http.post('*/api/auth/register', () =>
    HttpResponse.json({ error: { message, field } }, { status: 409 }),
  );
}

// Wrong credentials: one 401 with no field, so the client renders it form-level.
export function loginInvalid() {
  return http.post('*/api/auth/login', () =>
    HttpResponse.json({ error: { message: 'Invalid credentials' } }, { status: 401 }),
  );
}

// An Explore result with no posts, for the empty-state branch.
export function postsEmpty() {
  return http.get('*/api/posts', () =>
    HttpResponse.json({ data: [], page: 1, limit: 2, total: 0 }),
  );
}

// A failing posts list, for the error-state branch — proves the real client.ts
// turns a 500 into an ApiError the triad renders.
export function postsError() {
  return http.get('*/api/posts', () =>
    HttpResponse.json({ error: { message: 'Internal server error' } }, { status: 500 }),
  );
}
