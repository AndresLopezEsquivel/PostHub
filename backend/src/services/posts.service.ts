import { PoolClient } from 'pg';
import { query, queryOne, queryMany, withTransaction } from '../db/query';
import { isForeignKeyViolation } from '../db/pgErrors';
import { badRequest, forbidden, notFound } from '../errors/httpError';

// Posts data access + validation + row→API mapping. Like the other services it
// holds no req/res/session: the session user is passed in as a plain `userId`.
// This is where the <postCard> shape is assembled — the join and the (for now
// stubbed) counts live here, not in the snake_case row layer.

// --- API shapes (camelCase, client-facing) -------------------------------

export interface Author {
  username: string;
  avatarUrl: string | null;
}

export interface CategoryTag {
  name: string;
  slug: string;
}

// The list card, exactly as documented in docs/api_design.md "<postCard>".
export interface PostCard {
  id: number;
  title: string;
  excerpt: string;
  author: Author;
  categories: CategoryTag[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  createdAt: string;
}

// Post detail = the card plus the full body and the two fields the edit/detail
// screens need (image prefill, edited timestamp). See docs/api_design.md getPost.
export interface PostDetail extends PostCard {
  content: string;
  imageKey: string | null;
  updatedAt: string | null;
}

export interface PostList {
  data: PostCard[];
  page: number;
  limit: number;
  total: number;
}

// --- The shared card query ----------------------------------------------

// One SELECT feeds list, detail, and the create/update responses, so the card
// shape has a single source of truth. Categories are aggregated as a JSON array
// in-SQL (node-postgres parses json to a JS array); the author is joined in.
//
// `viewerParam` is the SQL placeholder (`$1`, `$3`, …) that binds the *viewing*
// user's id, used to derive likedByMe/bookmarkedByMe. It's a placeholder token
// the caller owns — never user input — so interpolating it is injection-safe
// (the value still binds through pg). A null viewer makes `user_id = NULL` never
// match, so both flags come back `false` for anonymous readers automatically.
// `int8` COUNT → JS number and `bool` → JS boolean via the pg parsers in db/types.
function cardSelect(viewerParam: string): string {
  return `
  SELECT p.id, p.title, p.content, p.image_key, p.created_at, p.updated_at,
         u.username AS author_username, u.avatar_key AS author_avatar_key,
         COALESCE((
           SELECT json_agg(json_build_object('name', c.name, 'slug', c.slug) ORDER BY c.name)
           FROM post_categories pc
           JOIN categories c ON c.id = pc.category_id
           WHERE pc.post_id = p.id
         ), '[]') AS categories,
         (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comment_count,
         EXISTS (SELECT 1 FROM post_likes pl
                  WHERE pl.post_id = p.id AND pl.user_id = ${viewerParam}) AS liked_by_me,
         EXISTS (SELECT 1 FROM bookmarks bm
                  WHERE bm.post_id = p.id AND bm.user_id = ${viewerParam}) AS bookmarked_by_me
  FROM posts p
  JOIN users u ON u.id = p.author_id
`;
}

// The row shape the card SELECT returns — not a table row, so it lives here
// rather than in types/db.ts (which mirrors tables one-for-one).
interface PostCardRow {
  id: number;
  title: string;
  content: string;
  image_key: string | null;
  created_at: string;
  updated_at: string | null;
  author_username: string;
  author_avatar_key: string | null;
  categories: CategoryTag[];
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  bookmarked_by_me: boolean;
}

// --- Pure mappers (unit-tested) -----------------------------------------

const EXCERPT_MAX = 200;

// Collapse whitespace and truncate to a word boundary with an ellipsis. The list
// card sends this; detail sends the full content instead.
export function buildExcerpt(content: string, max = EXCERPT_MAX): string {
  const normalized = content.trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) return normalized;
  const truncated = normalized.slice(0, max);
  const lastSpace = truncated.lastIndexOf(' ');
  const head = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${head}…`;
}

// The single place step 9 (uploads) will build the real S3/CDN URL from a key.
// No user has an avatar_key yet (register/seed never set it), so this is null.
export function avatarKeyToUrl(_key: string | null): string | null {
  return null;
}

export function toPostCard(row: PostCardRow): PostCard {
  return {
    id: row.id,
    title: row.title,
    excerpt: buildExcerpt(row.content),
    author: {
      username: row.author_username,
      avatarUrl: avatarKeyToUrl(row.author_avatar_key),
    },
    categories: row.categories,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    likedByMe: row.liked_by_me,
    bookmarkedByMe: row.bookmarked_by_me,
    createdAt: row.created_at,
  };
}

export function toPostDetail(row: PostCardRow): PostDetail {
  return {
    ...toPostCard(row),
    content: row.content,
    imageKey: row.image_key,
    updatedAt: row.updated_at,
  };
}

// --- Pagination ----------------------------------------------------------

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toPositiveInt(value: unknown, fallback: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : NaN;
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

// Query params arrive as strings; anything absent, non-numeric, or < 1 falls back
// to the default, and limit is capped so a caller can't request an unbounded page.
export function normalizePagination(
  page: unknown,
  limit: unknown,
): { page: number; limit: number } {
  return {
    page: toPositiveInt(page, DEFAULT_PAGE),
    limit: Math.min(toPositiveInt(limit, DEFAULT_LIMIT), MAX_LIMIT),
  };
}

// --- Validation ----------------------------------------------------------

const TITLE_MAX = 200; // posts.title varchar(200)
const IMAGE_KEY_MAX = 255; // posts.image_key varchar(255)

function validateTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) throw badRequest('Title is required', 'title');
  if (title.length > TITLE_MAX) {
    throw badRequest(`Title must be at most ${TITLE_MAX} characters`, 'title');
  }
  return title;
}

function validateContent(value: unknown): string {
  const content = typeof value === 'string' ? value.trim() : '';
  if (!content) throw badRequest('Content is required', 'content');
  return content;
}

// Accepts an array of positive integer category ids; de-duplicates. Existence of
// the ids is enforced by the FK (a bad id → 23503 → 400, mapped at the call site).
function validateCategoryIds(value: unknown): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw badRequest('categoryIds must be an array', 'categoryIds');
  }
  for (const id of value) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      throw badRequest('categoryIds must be an array of positive integers', 'categoryIds');
    }
  }
  return [...new Set(value as number[])];
}

function validateImageKey(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw badRequest('imageKey must be a string or null', 'imageKey');
  }
  const key = value.trim();
  if (!key) return null;
  if (key.length > IMAGE_KEY_MAX) {
    throw badRequest(`imageKey must be at most ${IMAGE_KEY_MAX} characters`, 'imageKey');
  }
  return key;
}

// --- Queries -------------------------------------------------------------

async function fetchPostRow(
  postId: number,
  viewerId: number | null,
): Promise<PostCardRow | null> {
  return queryOne<PostCardRow>(`${cardSelect('$1')} WHERE p.id = $2`, [viewerId, postId]);
}

// Likes and bookmarks hang off a post; a toggle on a missing post is a 404, the
// same as the read/write handlers. Exported for the like/bookmark services to reuse.
export async function assertPostExists(postId: number): Promise<void> {
  const row = await queryOne<{ id: number }>('SELECT id FROM posts WHERE id = $1', [postId]);
  if (!row) throw notFound('Post not found');
}

async function insertPostCategories(
  tx: PoolClient,
  postId: number,
  categoryIds: number[],
): Promise<void> {
  if (categoryIds.length === 0) return;
  // Multi-row insert: ($1,$2),($1,$3),… — $1 is the post id, the rest the ids.
  const rows = categoryIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await tx.query(
    `INSERT INTO post_categories (post_id, category_id) VALUES ${rows}`,
    [postId, ...categoryIds],
  );
}

// Fetch author_id for the ownership check. 404 if the post is gone, 403 if it
// belongs to someone else — the distinction the whole app keeps honest.
async function assertOwner(postId: number, userId: number): Promise<void> {
  const row = await queryOne<{ author_id: number }>(
    'SELECT author_id FROM posts WHERE id = $1',
    [postId],
  );
  if (!row) throw notFound('Post not found');
  if (row.author_id !== userId) {
    throw forbidden('You are not the author of this post');
  }
}

export interface ListParams {
  search?: unknown;
  category?: unknown;
  sort?: unknown;
  page?: unknown;
  limit?: unknown;
}

export async function listPosts(
  params: ListParams,
  viewerId: number | null,
): Promise<PostList> {
  const { page, limit } = normalizePagination(params.page, params.limit);
  const sort = params.sort === 'likes' ? 'likes' : 'newest';

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (typeof params.search === 'string' && params.search.trim()) {
    values.push(`%${params.search.trim()}%`);
    conditions.push(`(p.title ILIKE $${values.length} OR p.content ILIKE $${values.length})`);
  }
  if (typeof params.category === 'string' && params.category.trim()) {
    values.push(params.category.trim());
    conditions.push(
      `EXISTS (SELECT 1 FROM post_categories pc
                 JOIN categories c ON c.id = pc.category_id
                WHERE pc.post_id = p.id AND c.slug = $${values.length})`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // `likes` orders by the real like count (empty until step 4, so it behaves like
  // `newest` today); id is a stable tiebreak for equal timestamps/counts.
  const orderBy =
    sort === 'likes'
      ? 'ORDER BY (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) DESC, p.created_at DESC, p.id DESC'
      : 'ORDER BY p.created_at DESC, p.id DESC';

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM posts p ${where}`,
    values,
  );
  const total = totalRow?.total ?? 0;

  // The `where`/`orderBy` placeholders index into `values` ($1..$n); the viewer
  // and pagination bind *after* them so the same `where` also serves the
  // viewer-free total query above.
  const offset = (page - 1) * limit;
  const viewerParam = `$${values.length + 1}`;
  const rows = await queryMany<PostCardRow>(
    `${cardSelect(viewerParam)} ${where} ${orderBy} LIMIT $${values.length + 2} OFFSET $${values.length + 3}`,
    [...values, viewerId, limit, offset],
  );

  return { data: rows.map(toPostCard), page, limit, total };
}

// The session user's saved posts, newest-saved first. Reuses the card machinery;
// the viewer is the owner, so bookmarkedByMe is true for every card here.
export async function listBookmarks(
  userId: number,
  params: { page?: unknown; limit?: unknown },
): Promise<PostList> {
  const { page, limit } = normalizePagination(params.page, params.limit);

  const totalRow = await queryOne<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM bookmarks WHERE user_id = $1',
    [userId],
  );
  const total = totalRow?.total ?? 0;

  const offset = (page - 1) * limit;
  const rows = await queryMany<PostCardRow>(
    `${cardSelect('$1')}
       JOIN bookmarks bkm ON bkm.post_id = p.id
      WHERE bkm.user_id = $1
      ORDER BY bkm.created_at DESC, p.id DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  return { data: rows.map(toPostCard), page, limit, total };
}

// The posts a given user authored, newest-first — the profile's "posts" tab.
// Reuses the card machinery like listBookmarks, but the author and the viewer are
// distinct people, so they bind to separate params ($1 author, $2 viewer).
export async function listPostsByAuthor(
  authorId: number,
  params: { page?: unknown; limit?: unknown },
  viewerId: number | null,
): Promise<PostList> {
  const { page, limit } = normalizePagination(params.page, params.limit);

  const totalRow = await queryOne<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM posts WHERE author_id = $1',
    [authorId],
  );
  const total = totalRow?.total ?? 0;

  const offset = (page - 1) * limit;
  const rows = await queryMany<PostCardRow>(
    `${cardSelect('$2')}
      WHERE p.author_id = $1
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $3 OFFSET $4`,
    [authorId, viewerId, limit, offset],
  );

  return { data: rows.map(toPostCard), page, limit, total };
}

// The personalized feed: posts by the authors this user follows, newest-first.
// Reuses the card machinery a third time (after listBookmarks/listPostsByAuthor);
// here the follower is also the viewer, so a single $1 binds both the followee
// subquery and the card's likedByMe/bookmarkedByMe. Own posts never appear — you
// can't follow yourself (the follows_no_self_follow CHECK), so your id is never in
// the followee set.
export async function listFeed(
  userId: number,
  params: { page?: unknown; limit?: unknown },
): Promise<PostList> {
  const { page, limit } = normalizePagination(params.page, params.limit);

  const scope = 'p.author_id IN (SELECT f.followee_id FROM follows f WHERE f.follower_id = $1)';

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM posts p WHERE ${scope}`,
    [userId],
  );
  const total = totalRow?.total ?? 0;

  const offset = (page - 1) * limit;
  const rows = await queryMany<PostCardRow>(
    `${cardSelect('$1')}
      WHERE ${scope}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  return { data: rows.map(toPostCard), page, limit, total };
}

export async function getPost(
  postId: number,
  viewerId: number | null,
): Promise<PostDetail> {
  const row = await fetchPostRow(postId, viewerId);
  if (!row) throw notFound('Post not found');
  return toPostDetail(row);
}

export interface CreatePostInput {
  title: unknown;
  content: unknown;
  categoryIds?: unknown;
  imageKey?: unknown;
}

export async function createPost(
  authorId: number,
  input: CreatePostInput,
): Promise<PostCard> {
  const title = validateTitle(input.title);
  const content = validateContent(input.content);
  const categoryIds = validateCategoryIds(input.categoryIds);
  const imageKey = validateImageKey(input.imageKey);

  const postId = await withTransaction(async (tx) => {
    const inserted = await tx.query<{ id: number }>(
      `INSERT INTO posts (author_id, title, content, image_key)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [authorId, title, content, imageKey],
    );
    const id = inserted.rows[0].id;
    await insertPostCategories(tx, id, categoryIds);
    return id;
  }).catch((err) => {
    if (isForeignKeyViolation(err)) {
      throw badRequest('One or more categoryIds do not exist', 'categoryIds');
    }
    throw err;
  });

  // Just committed, so it exists — re-read through the shared card query. The
  // author is the viewer here, so likedByMe/bookmarkedByMe reflect their state.
  const row = await fetchPostRow(postId, authorId);
  return toPostCard(row!);
}

export interface UpdatePostInput {
  title?: unknown;
  content?: unknown;
  categoryIds?: unknown;
  imageKey?: unknown;
}

export async function updatePost(
  postId: number,
  userId: number,
  input: UpdatePostInput,
): Promise<PostCard> {
  await assertOwner(postId, userId);

  // Validate only the fields that are present (partial update).
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.title !== undefined) {
    values.push(validateTitle(input.title));
    sets.push(`title = $${values.length}`);
  }
  if (input.content !== undefined) {
    values.push(validateContent(input.content));
    sets.push(`content = $${values.length}`);
  }
  if (input.imageKey !== undefined) {
    values.push(validateImageKey(input.imageKey));
    sets.push(`image_key = $${values.length}`);
  }
  const hasCategoryIds = input.categoryIds !== undefined;
  const categoryIds = hasCategoryIds ? validateCategoryIds(input.categoryIds) : [];

  await withTransaction(async (tx) => {
    if (sets.length > 0) {
      values.push(postId);
      await tx.query(
        `UPDATE posts SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
        values,
      );
    } else if (hasCategoryIds) {
      // Only the category set changed — still record it as an edit.
      await tx.query('UPDATE posts SET updated_at = now() WHERE id = $1', [postId]);
    }
    if (hasCategoryIds) {
      await tx.query('DELETE FROM post_categories WHERE post_id = $1', [postId]);
      await insertPostCategories(tx, postId, categoryIds);
    }
  }).catch((err) => {
    if (isForeignKeyViolation(err)) {
      throw badRequest('One or more categoryIds do not exist', 'categoryIds');
    }
    throw err;
  });

  const row = await fetchPostRow(postId, userId);
  return toPostCard(row!);
}

export async function deletePost(postId: number, userId: number): Promise<void> {
  await assertOwner(postId, userId);
  await query<{ id: number }>('DELETE FROM posts WHERE id = $1', [postId]);
}
