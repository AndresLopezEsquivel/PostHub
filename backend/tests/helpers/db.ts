import { query, queryOne } from '../../src/db/query';

// Test-database helpers for the integration suite. resetDb() gives each test a
// clean slate; the seed* helpers insert just the rows a test needs and return
// their ids. They mirror the shapes in src/db/seed-dev.ts, kept deliberately
// small — richer fixtures get added by the pass that first needs them.

// Every domain table, in an order that doesn't matter because CASCADE clears
// FK-dependent rows. categories is intentionally absent: it's reference data,
// re-seeded explicitly by seedCategories() when a test needs it.
const DOMAIN_TABLES = [
  'users',
  'posts',
  'comments',
  'post_likes',
  'bookmarks',
  'follows',
  'notifications',
  'post_categories',
];

// RESTART IDENTITY resets the serial sequences so ids are predictable per test.
export async function resetDb(): Promise<void> {
  await query(
    `TRUNCATE ${DOMAIN_TABLES.join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export async function seedCategories(): Promise<void> {
  const categories: ReadonlyArray<[string, string]> = [
    ['Philosophy', 'philosophy'],
    ['Fiction', 'fiction'],
    ['Technology', 'technology'],
  ];
  for (const [name, slug] of categories) {
    await query(
      `INSERT INTO categories (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING`,
      [name, slug],
    );
  }
}

export async function seedUser(
  overrides: Partial<{
    username: string;
    email: string;
    bio: string | null;
    passwordHash: string;
  }> = {},
): Promise<number> {
  const user = {
    username: 'tester',
    email: 'tester@example.com',
    bio: null as string | null,
    passwordHash: 'not-a-real-hash',
    ...overrides,
  };
  const row = await queryOne<{ id: number }>(
    `INSERT INTO users (username, email, password_hash, bio)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [user.username, user.email, user.passwordHash, user.bio],
  );
  return row!.id;
}

export async function seedPost(
  input: {
    authorId: number;
    title?: string;
    content?: string;
    imageKey?: string | null;
    categoryIds?: number[];
  },
): Promise<number> {
  const post = {
    title: 'Sample post',
    content: 'Sample content for the post body.',
    imageKey: null as string | null,
    categoryIds: [] as number[],
    ...input,
  };
  const row = await queryOne<{ id: number }>(
    `INSERT INTO posts (author_id, title, content, image_key)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [post.authorId, post.title, post.content, post.imageKey],
  );
  const postId = row!.id;
  for (const categoryId of post.categoryIds) {
    await query(
      `INSERT INTO post_categories (post_id, category_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [postId, categoryId],
    );
  }
  return postId;
}

// Arrange a like/bookmark directly, for tests that need engagement state without
// driving it through the API. Idempotent, mirroring the toggle semantics.
export async function seedLike(input: { userId: number; postId: number }): Promise<void> {
  await query(
    `INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [input.userId, input.postId],
  );
}

export async function seedBookmark(input: { userId: number; postId: number }): Promise<void> {
  await query(
    `INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [input.userId, input.postId],
  );
}

// Arrange a follow edge directly. Idempotent, mirroring the toggle semantics; the
// -er/-ee direction is fixed (follower does the following, followee is followed).
export async function seedFollow(input: {
  followerId: number;
  followeeId: number;
}): Promise<void> {
  await query(
    `INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [input.followerId, input.followeeId],
  );
}

export async function seedComment(
  input: { postId: number; authorId: number; content?: string },
): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO comments (post_id, author_id, content)
     VALUES ($1, $2, $3) RETURNING id`,
    [input.postId, input.authorId, input.content ?? 'Sample comment.'],
  );
  return row!.id;
}
