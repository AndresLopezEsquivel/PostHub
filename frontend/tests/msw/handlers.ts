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

  // GET /api/posts/:postId — post detail (card fields + content/imageKey/updatedAt).
  // Any id present in POSTS resolves; postNotFound() overrides for the 404 branch.
  http.get('*/api/posts/:postId', ({ params }) => {
    const post = POSTS.find((x) => x.id === Number(params.postId));
    if (!post) {
      return HttpResponse.json({ error: { message: 'Post not found' } }, { status: 404 });
    }
    return HttpResponse.json({
      ...post,
      content: `Full body of ${post.title}.\nSecond line.`,
      imageKey: null,
      imageUrl: null,
      updatedAt: null,
    });
  }),

  // GET /api/posts/:postId/comments — oldest-first, paged. limit defaults to a
  // small 2 so "Load more" is reachable with the three-comment fixture.
  http.get('*/api/posts/:postId/comments', ({ request }) => {
    const p = new URL(request.url).searchParams;
    const limit = Number(p.get('limit')) || 2;
    const page = Number(p.get('page')) || 1;
    const total = COMMENTS.length;
    const data = COMMENTS.slice((page - 1) * limit, (page - 1) * limit + limit);
    return HttpResponse.json({ data, page, limit, total });
  }),

  // POST /api/posts/:postId/comments — echo back a new comment with a fresh id.
  http.post('*/api/posts/:postId/comments', async ({ request }) => {
    const body = (await request.json()) as { content: string };
    return HttpResponse.json(
      {
        id: 9000 + Math.floor(Math.random() * 1000),
        content: body.content,
        author: { username: 'andres', avatarUrl: null },
        createdAt: '2026-08-10T00:00:00.000Z',
        updatedAt: null,
      },
      { status: 201 },
    );
  }),

  // DELETE /api/comments/:id — 204, no body.
  http.delete('*/api/comments/:id', () => new HttpResponse(null, { status: 204 })),

  // Like toggle — PUT adds, DELETE removes. likeCount is the fixture's base ±1 so
  // the client's reconcile matches its optimistic guess (no visible jump).
  http.put('*/api/posts/:postId/like', ({ params }) => {
    const id = Number(params.postId);
    const base = POSTS.find((x) => x.id === id)?.likeCount ?? 0;
    return HttpResponse.json({ postId: id, likeCount: base + 1, likedByMe: true });
  }),
  http.delete('*/api/posts/:postId/like', ({ params }) => {
    const id = Number(params.postId);
    const base = POSTS.find((x) => x.id === id)?.likeCount ?? 0;
    return HttpResponse.json({ postId: id, likeCount: base, likedByMe: false });
  }),

  // Bookmark toggle — no count (private), just the resulting state.
  http.put('*/api/posts/:postId/bookmark', ({ params }) =>
    HttpResponse.json({ postId: Number(params.postId), bookmarkedByMe: true }),
  ),
  http.delete('*/api/posts/:postId/bookmark', ({ params }) =>
    HttpResponse.json({ postId: Number(params.postId), bookmarkedByMe: false }),
  ),

  // POST /api/posts — 201 with a new card echoing the submitted title/body. The
  // create test adds a matching GET /api/posts/100 so the post-create navigation
  // lands on a real detail.
  http.post('*/api/posts', async ({ request }) => {
    const body = (await request.json()) as { title: string; content: string };
    return HttpResponse.json(
      card({ id: 100, title: body.title, excerpt: body.content.slice(0, 200) }),
      { status: 201 },
    );
  }),

  // PATCH /api/posts/:postId — 200 echoing the edited card (title override).
  http.patch('*/api/posts/:postId', async ({ params, request }) => {
    const id = Number(params.postId);
    const base = POSTS.find((x) => x.id === id) ?? card({ id, title: 'Post' });
    const body = (await request.json()) as { title?: string };
    return HttpResponse.json({ ...base, id, title: body.title ?? base.title });
  }),

  // DELETE /api/posts/:postId — 204, no body. (Distinct path from …/like, …/bookmark.)
  http.delete('*/api/posts/:postId', () => new HttpResponse(null, { status: 204 })),

  // POST /api/uploads/presign — mints a fake presigned PUT URL + key. The key prefix
  // follows `purpose`, like the real service (posts/ vs avatars/).
  http.post('*/api/uploads/presign', async ({ request }) => {
    const body = (await request.json()) as { purpose: 'post' | 'avatar'; contentType: string };
    const prefix = body.purpose === 'avatar' ? 'avatars' : 'posts';
    const key = `${prefix}/generated.jpg`;
    return HttpResponse.json({
      uploadUrl: `https://s3.test/${key}?X-Amz-Signature=sig`,
      key,
      expiresIn: 300,
    });
  }),

  // The direct-to-S3 PUT the client makes to uploadUrl. MSW matches by URL regardless
  // of origin, so this intercepts the cross-origin upload the same way — 200, no body.
  http.put('https://s3.test/*', () => new HttpResponse(null, { status: 200 })),

  // GET /api/users/:username — public profile. followerCount 10; followedByMe false
  // by default (the follow test toggles it). userNotFound() overrides for 404.
  http.get('*/api/users/:username', ({ params }) => HttpResponse.json(userProfile(String(params.username)))),

  // GET /api/users/:username/posts — the author's posts (POSTS are all by 'andres').
  http.get('*/api/users/:username/posts', ({ params, request }) => {
    const username = String(params.username);
    const items = POSTS.filter((x) => x.author.username === username);
    const p = new URL(request.url).searchParams;
    const limit = Number(p.get('limit')) || 2;
    const page = Number(p.get('page')) || 1;
    return HttpResponse.json({
      data: items.slice((page - 1) * limit, (page - 1) * limit + limit),
      page,
      limit,
      total: items.length,
    });
  }),

  // GET /api/users/:username/followers and /following — the FollowUser list.
  http.get('*/api/users/:username/followers', () =>
    HttpResponse.json({ data: FOLLOW_USERS, page: 1, limit: 20, total: FOLLOW_USERS.length }),
  ),
  http.get('*/api/users/:username/following', () =>
    HttpResponse.json({ data: FOLLOW_USERS, page: 1, limit: 20, total: FOLLOW_USERS.length }),
  ),

  // PATCH /api/users/me — echo a profile with the submitted bio. emailTaken()
  // overrides for the 409 branch.
  http.patch('*/api/users/me', async ({ request }) => {
    const body = (await request.json()) as { bio?: string | null };
    return HttpResponse.json({ ...userProfile('andres'), bio: body.bio ?? null });
  }),

  // Follow toggle — FollowState with the target's new follower count (base 10 ±1).
  http.put('*/api/users/:username/follow', ({ params }) =>
    HttpResponse.json({ username: String(params.username), followedByMe: true, followerCount: 11 }),
  ),
  http.delete('*/api/users/:username/follow', ({ params }) =>
    HttpResponse.json({ username: String(params.username), followedByMe: false, followerCount: 10 }),
  ),

  // GET /api/feed — a page of posts (reusing POSTS). feedEmpty() overrides for the CTA.
  http.get('*/api/feed', ({ request }) => {
    const p = new URL(request.url).searchParams;
    const limit = Number(p.get('limit')) || 20;
    const page = Number(p.get('page')) || 1;
    return HttpResponse.json({
      data: POSTS.slice((page - 1) * limit, (page - 1) * limit + limit),
      page,
      limit,
      total: POSTS.length,
    });
  }),

  // GET /api/bookmarks — saved posts, every row bookmarkedByMe: true so the toggle
  // reads "Bookmarked" and unbookmarking removes the card. bookmarksEmpty() overrides.
  http.get('*/api/bookmarks', ({ request }) => {
    const p = new URL(request.url).searchParams;
    const limit = Number(p.get('limit')) || 20;
    const page = Number(p.get('page')) || 1;
    const items = POSTS.map((x) => ({ ...x, bookmarkedByMe: true }));
    return HttpResponse.json({
      data: items.slice((page - 1) * limit, (page - 1) * limit + limit),
      page,
      limit,
      total: items.length,
    });
  }),

  // GET /api/notifications — a like, a comment, and a follow; two unread. unreadCount
  // is the full tally regardless of pagination. notificationsEmpty() overrides.
  http.get('*/api/notifications', () =>
    HttpResponse.json({
      data: NOTIFICATIONS,
      page: 1,
      limit: 20,
      total: NOTIFICATIONS.length,
      unreadCount: NOTIFICATIONS.filter((n) => !n.isRead).length,
    }),
  ),

  // PATCH /api/notifications/:id — echo the new read state.
  http.patch('*/api/notifications/:id', async ({ params, request }) => {
    const body = (await request.json()) as { isRead: boolean };
    return HttpResponse.json({ id: Number(params.id), isRead: body.isRead });
  }),

  // POST /api/notifications/read-all — clears the tally.
  http.post('*/api/notifications/read-all', () => HttpResponse.json({ unreadCount: 0 })),
];

// --- Notifications fixtures --------------------------------------------------

const NOTIFICATIONS = [
  {
    id: 1,
    type: 'like' as const,
    actor: { username: 'carol', avatarUrl: null },
    post: { id: 1, title: 'Alpha' },
    isRead: false,
    createdAt: '2026-08-03T00:00:00.000Z',
  },
  {
    id: 2,
    type: 'comment' as const,
    actor: { username: 'dave', avatarUrl: null },
    post: { id: 2, title: 'Bravo' },
    isRead: false,
    createdAt: '2026-08-02T00:00:00.000Z',
  },
  {
    id: 3,
    type: 'follow' as const,
    actor: { username: 'erin', avatarUrl: null },
    post: null,
    isRead: true,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

// --- Users / follows fixtures ------------------------------------------------

function userProfile(username: string) {
  return {
    username,
    bio: `Bio of ${username}`,
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    postCount: POSTS.filter((x) => x.author.username === username).length,
    followerCount: 10,
    followingCount: 5,
    followedByMe: false,
  };
}

const FOLLOW_USERS = [
  { username: 'carol', avatarUrl: null, bio: 'Carol writes things.', followedByMe: false },
  { username: 'dave', avatarUrl: null, bio: null, followedByMe: true },
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

// Three comments across two authors (limit 2 → page 1 has two, page 2 the third,
// so "Load more" is reachable). 'andres' is the logged-in user in the detail test,
// so the delete affordance shows on comment 2 and not the 'bianca' ones.
const COMMENTS = [
  { id: 1, content: 'First comment', author: { username: 'bianca', avatarUrl: null }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: null },
  { id: 2, content: 'My own comment', author: { username: 'andres', avatarUrl: null }, createdAt: '2026-08-02T00:00:00.000Z', updatedAt: null },
  { id: 3, content: 'Third comment', author: { username: 'bianca', avatarUrl: null }, createdAt: '2026-08-03T00:00:00.000Z', updatedAt: null },
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

// A missing post, for Post detail's on-screen 404 state.
export function postNotFound() {
  return http.get('*/api/posts/:postId', () =>
    HttpResponse.json({ error: { message: 'Post not found' } }, { status: 404 }),
  );
}

// A failing like toggle, for the optimistic-rollback branch.
export function likeError() {
  return http.put('*/api/posts/:postId/like', () =>
    HttpResponse.json({ error: { message: 'Internal server error' } }, { status: 500 }),
  );
}

// A missing user, for the profile/follow-list 404 state.
export function userNotFound() {
  return http.get('*/api/users/:username', () =>
    HttpResponse.json({ error: { message: 'User not found' } }, { status: 404 }),
  );
}

// An email already registered, for Edit profile's 409-on-the-email-field branch.
export function emailTaken() {
  return http.patch('*/api/users/me', () =>
    HttpResponse.json({ error: { message: 'Email already registered', field: 'email' } }, { status: 409 }),
  );
}

// An empty feed — a user following no one (a 200 empty page, not a 401).
export function feedEmpty() {
  return http.get('*/api/feed', () =>
    HttpResponse.json({ data: [], page: 1, limit: 20, total: 0 }),
  );
}

// An empty bookmarks list.
export function bookmarksEmpty() {
  return http.get('*/api/bookmarks', () =>
    HttpResponse.json({ data: [], page: 1, limit: 20, total: 0 }),
  );
}

// No notifications (and no unread), for the empty state and a clear badge.
export function notificationsEmpty() {
  return http.get('*/api/notifications', () =>
    HttpResponse.json({ data: [], page: 1, limit: 20, total: 0, unreadCount: 0 }),
  );
}
