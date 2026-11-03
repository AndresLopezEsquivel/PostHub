import { PoolClient } from 'pg';
import { query, queryOne, queryMany, withTransaction } from '../db/query';
import { isForeignKeyViolation } from '../db/pgErrors';
import { badRequest, forbidden, notFound } from '../errors/httpError';
import { env } from '../config/env';

// Builds the post card that every post list returns. Other services reuse
// Author, avatarKeyToUrl, normalizePagination and assertPostExists from here.

export interface Author {
  username: string;
  avatarUrl: string | null;
}

export interface CategoryTag {
  name: string;
  slug: string;
}

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

export interface PostDetail extends PostCard {
  content: string;
  // imageUrl is null while S3_PUBLIC_BASE_URL is unset, even when imageKey is
  // set.
  imageKey: string | null;
  imageUrl: string | null;
  updatedAt: string | null;
}

export interface PostList {
  data: PostCard[];
  page: number;
  limit: number;
  total: number;
}

// One SELECT serves every post list, the detail view and the create and update
// responses, so they all return a post in the same shape. json_agg builds the
// categories array in SQL, and node-postgres parses json into a JS array.
//
// viewerParam is the placeholder ($1, $3, ...) for the viewer's id, used for
// likedByMe and bookmarkedByMe. Callers pass a fixed placeholder, never user
// input, so interpolating it is safe. An anonymous viewer binds null, and
// user_id = NULL never matches, so both flags come back false. The COUNTs
// arrive as numbers because of the int8 parser in db/types.ts.
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

// What cardSelect returns. It isn't a table row, so it lives here rather than
// in types/db.ts.
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

// Turns a stored S3 key into a URL for avatars and post images. The base is
// the CloudFront distribution: the bucket is private and only CloudFront can
// read it (OAC), so there is no direct S3 URL. Null when the key or the base
// URL is missing, so the page shows no image instead of a broken one.
export function keyToPublicUrl(key: string | null): string | null {
  if (!key || !env.s3PublicBaseUrl) return null;
  return `${env.s3PublicBaseUrl.replace(/\/$/, '')}/${key}`;
}

// Same as keyToPublicUrl. Kept because the users, comments and notifications
// services import it under this name.
export function avatarKeyToUrl(key: string | null): string | null {
  return keyToPublicUrl(key);
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
    imageUrl: keyToPublicUrl(row.image_key),
    updatedAt: row.updated_at,
  };
}

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

// The FK checks that each id exists. A bad id fails with 23503, which the
// callers turn into a 400.
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

async function fetchPostRow(
  postId: number,
  viewerId: number | null,
): Promise<PostCardRow | null> {
  return queryOne<PostCardRow>(`${cardSelect('$1')} WHERE p.id = $2`, [viewerId, postId]);
}

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
  // Multi-row insert: ($1, $2), ($1, $3), ... where $1 is the post id.
  const rows = categoryIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await tx.query(
    `INSERT INTO post_categories (post_id, category_id) VALUES ${rows}`,
    [postId, ...categoryIds],
  );
}

// 404 if the post is gone, 403 if it belongs to someone else.
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

  // id breaks ties between equal counts or timestamps, so pages don't overlap.
  const orderBy =
    sort === 'likes'
      ? 'ORDER BY (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) DESC, p.created_at DESC, p.id DESC'
      : 'ORDER BY p.created_at DESC, p.id DESC';

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM posts p ${where}`,
    values,
  );
  const total = totalRow?.total ?? 0;

  // where uses $1..$n from values. The viewer and pagination placeholders come
  // after them, so the total query above can reuse where without the viewer.
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

// The profile's posts tab, newest first. The author and the viewer are
// different people, so they bind separately ($1 author, $2 viewer).
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

// Posts by the authors this user follows, newest first. The user is also the
// viewer, so $1 binds both. Their own posts never appear: the
// follows_no_self_follow CHECK keeps their id out of the followee set.
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

  // The post was just committed, so the assertion is safe. The author is the
  // viewer, so likedByMe and bookmarkedByMe show their own state.
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
      // Only the categories changed. That still counts as an edit.
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
