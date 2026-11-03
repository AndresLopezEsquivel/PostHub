import { http, HttpResponse } from 'msw';

// Paths are written with a leading '*' so they match whatever origin jsdom is
// serving from. Client code only ever requests the relative '/api/...' path.
//
// Keep the shapes identical to the real API's: a handler that returns a shape
// the API never would makes a passing test meaningless.

// Anonymous by default: GET /api/auth/session returns 401 without a session.
// Tests override this with server.use().
export const handlers = [
  http.get('*/api/auth/session', () =>
    HttpResponse.json({ error: { message: 'Not authenticated' } }, { status: 401 }),
  ),

  // Echoes the username and email back, as the real API does.
  // registerConflict() overrides this for a taken username or email.
  http.post('*/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as { username: string; email: string };
    return HttpResponse.json({ username: body.username, email: body.email }, { status: 201 });
  }),

  // Succeeds by default; loginInvalid() overrides this.
  http.post('*/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string };
    return HttpResponse.json({ username: 'andres', email: body.email });
  }),

  http.post('*/api/auth/logout', () => new HttpResponse(null, { status: 204 })),

  // A plain array, not the paginated envelope, sorted by name like the real API.
  http.get('*/api/categories', () => HttpResponse.json(CATEGORIES)),

  // Applies search, category, sort, page and limit, so the integration tests
  // exercise real filtering and paging through the real client. limit defaults
  // to 2 (there are three posts) so there is a second page.
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

  // Any id in POSTS resolves; postNotFound() overrides this for the 404 case.
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

  // Oldest first. limit defaults to 2 so "Load more" appears with three comments.
  http.get('*/api/posts/:postId/comments', ({ request }) => {
    const p = new URL(request.url).searchParams;
    const limit = Number(p.get('limit')) || 2;
    const page = Number(p.get('page')) || 1;
    const total = COMMENTS.length;
    const data = COMMENTS.slice((page - 1) * limit, (page - 1) * limit + limit);
    return HttpResponse.json({ data, page, limit, total });
  }),

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

  http.delete('*/api/comments/:id', () => new HttpResponse(null, { status: 204 })),

  // PUT returns the fixture's count plus one and DELETE returns it unchanged,
  // matching the client's optimistic guess.
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

  // No count, since bookmarks are private.
  http.put('*/api/posts/:postId/bookmark', ({ params }) =>
    HttpResponse.json({ postId: Number(params.postId), bookmarkedByMe: true }),
  ),
  http.delete('*/api/posts/:postId/bookmark', ({ params }) =>
    HttpResponse.json({ postId: Number(params.postId), bookmarkedByMe: false }),
  ),

  // The create test adds a matching GET /api/posts/100, so the redirect after
  // creating lands on a real post.
  http.post('*/api/posts', async ({ request }) => {
    const body = (await request.json()) as { title: string; content: string };
    return HttpResponse.json(
      card({ id: 100, title: body.title, excerpt: body.content.slice(0, 200) }),
      { status: 201 },
    );
  }),

  http.patch('*/api/posts/:postId', async ({ params, request }) => {
    const id = Number(params.postId);
    const base = POSTS.find((x) => x.id === id) ?? card({ id, title: 'Post' });
    const body = (await request.json()) as { title?: string };
    return HttpResponse.json({ ...base, id, title: body.title ?? base.title });
  }),

  http.delete('*/api/posts/:postId', () => new HttpResponse(null, { status: 204 })),

  // The key prefix follows purpose, like the real service (posts/ or avatars/).
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

  // The S3 PUT to uploadUrl. MSW matches by URL whatever the origin, so it
  // catches this cross-origin request too.
  http.put('https://s3.test/*', () => new HttpResponse(null, { status: 200 })),

  // followerCount is 10 and followedByMe false; the follow test toggles it.
  // userNotFound() overrides this for the 404 case.
  http.get('*/api/users/:username', ({ params }) => HttpResponse.json(userProfile(String(params.username)))),

  // All of POSTS are by 'andres'.
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

  http.get('*/api/users/:username/followers', () =>
    HttpResponse.json({ data: FOLLOW_USERS, page: 1, limit: 20, total: FOLLOW_USERS.length }),
  ),
  http.get('*/api/users/:username/following', () =>
    HttpResponse.json({ data: FOLLOW_USERS, page: 1, limit: 20, total: FOLLOW_USERS.length }),
  ),

  // emailTaken() overrides this for the 409 case.
  http.patch('*/api/users/me', async ({ request }) => {
    const body = (await request.json()) as { bio?: string | null };
    return HttpResponse.json({ ...userProfile('andres'), bio: body.bio ?? null });
  }),

  // The profile's followerCount of 10, plus one after a follow.
  http.put('*/api/users/:username/follow', ({ params }) =>
    HttpResponse.json({ username: String(params.username), followedByMe: true, followerCount: 11 }),
  ),
  http.delete('*/api/users/:username/follow', ({ params }) =>
    HttpResponse.json({ username: String(params.username), followedByMe: false, followerCount: 10 }),
  ),

  // feedEmpty() overrides this for the empty state.
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

  // Every row is bookmarkedByMe, so the button reads "Bookmarked" and
  // unbookmarking removes the card. bookmarksEmpty() overrides this.
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

  // A like, a comment and a follow, two of them unread.
  // notificationsEmpty() overrides this.
  http.get('*/api/notifications', () =>
    HttpResponse.json({
      data: NOTIFICATIONS,
      page: 1,
      limit: 20,
      total: NOTIFICATIONS.length,
      unreadCount: NOTIFICATIONS.filter((n) => !n.isRead).length,
    }),
  ),

  http.patch('*/api/notifications/:id', async ({ params, request }) => {
    const body = (await request.json()) as { isRead: boolean };
    return HttpResponse.json({ id: Number(params.id), isRead: body.isRead });
  }),

  http.post('*/api/notifications/read-all', () => HttpResponse.json({ unreadCount: 0 })),
];

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

// Three comments by two authors. With limit 2, page 1 has two and page 2 the
// third, so "Load more" appears. 'andres' is logged in in the detail test, so
// only comment 2 shows Delete.
const COMMENTS = [
  { id: 1, content: 'First comment', author: { username: 'bianca', avatarUrl: null }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: null },
  { id: 2, content: 'My own comment', author: { username: 'andres', avatarUrl: null }, createdAt: '2026-08-02T00:00:00.000Z', updatedAt: null },
  { id: 3, content: 'Third comment', author: { username: 'bianca', avatarUrl: null }, createdAt: '2026-08-03T00:00:00.000Z', updatedAt: null },
];

// Overrides the session for a logged-in user.
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

// A failing posts list, to check that the real client turns a 500 into an
// ApiError the page shows.
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

// An empty feed: a user who follows no one gets a 200 with no posts, not a 401.
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
