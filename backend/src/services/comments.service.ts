import { query, queryOne, queryMany, withTransaction } from '../db/query';
import { badRequest, forbidden, notFound } from '../errors/httpError';
import {
  Author,
  assertPostExists,
  avatarKeyToUrl,
  normalizePagination,
} from './posts.service';
import { insertNotification } from './notifications.service';

// A comment's author has the same shape as a post card's, so the author
// mapping and avatar URL come from posts.service.

export interface Comment {
  id: number;
  content: string;
  author: Author;
  createdAt: string;
  updatedAt: string | null;
}

export interface CommentList {
  data: Comment[];
  page: number;
  limit: number;
  total: number;
}

// One SELECT serves the list, create and update responses, so they all
// return a comment in the same shape.
const COMMENT_SELECT = `
  SELECT c.id, c.content, c.created_at, c.updated_at,
         u.username AS author_username, u.avatar_key AS author_avatar_key
  FROM comments c
  JOIN users u ON u.id = c.author_id
`;

// What COMMENT_SELECT returns, with the author joined in. CommentRow in
// types/db.ts is the raw table row.
interface CommentJoinRow {
  id: number;
  content: string;
  created_at: string;
  updated_at: string | null;
  author_username: string;
  author_avatar_key: string | null;
}

export function toComment(row: CommentJoinRow): Comment {
  return {
    id: row.id,
    content: row.content,
    author: {
      username: row.author_username,
      avatarUrl: avatarKeyToUrl(row.author_avatar_key),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// comments.content is text, with no length cap, so the only rule is that it
// isn't empty after trimming. Same rule as validateContent in posts.service.
function validateContent(value: unknown): string {
  const content = typeof value === 'string' ? value.trim() : '';
  if (!content) throw badRequest('Content is required', 'content');
  return content;
}

async function fetchCommentRow(commentId: number): Promise<CommentJoinRow | null> {
  return queryOne<CommentJoinRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [commentId]);
}

// Ownership guard, mirroring posts.service's assertOwner. 404 if the comment is
// gone, 403 if it belongs to someone else.
async function assertCommentOwner(commentId: number, userId: number): Promise<void> {
  const row = await queryOne<{ author_id: number }>(
    'SELECT author_id FROM comments WHERE id = $1',
    [commentId],
  );
  if (!row) throw notFound('Comment not found');
  if (row.author_id !== userId) {
    throw forbidden('You are not the author of this comment');
  }
}

export async function listPostComments(
  postId: number,
  params: { page?: unknown; limit?: unknown },
): Promise<CommentList> {
  await assertPostExists(postId);
  const { page, limit } = normalizePagination(params.page, params.limit);

  const totalRow = await queryOne<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM comments WHERE post_id = $1',
    [postId],
  );
  const total = totalRow?.total ?? 0;

  const offset = (page - 1) * limit;
  // Oldest-first: a comment thread reads chronologically (the opposite of the
  // newest-first posts list, on purpose); id is a stable tiebreak.
  const rows = await queryMany<CommentJoinRow>(
    `${COMMENT_SELECT} WHERE c.post_id = $1 ORDER BY c.created_at ASC, c.id ASC LIMIT $2 OFFSET $3`,
    [postId, limit, offset],
  );

  return { data: rows.map(toComment), page, limit, total };
}

export interface CommentInput {
  content: unknown;
}

export async function createComment(
  postId: number,
  authorId: number,
  input: CommentInput,
): Promise<Comment> {
  // This SELECT is both the existence check (404 if missing) and the lookup of
  // the post author, who gets the notification.
  const post = await queryOne<{ author_id: number }>(
    'SELECT author_id FROM posts WHERE id = $1',
    [postId],
  );
  if (!post) throw notFound('Post not found');
  const content = validateContent(input.content);

  const newId = await withTransaction(async (tx) => {
    const inserted = await tx.query<{ id: number }>(
      `INSERT INTO comments (post_id, author_id, content)
       VALUES ($1, $2, $3) RETURNING id`,
      [postId, authorId, content],
    );
    const id = inserted.rows[0].id;
    // Notify the post author, but never notify yourself for your own comment.
    if (post.author_id !== authorId) {
      await insertNotification(tx, {
        recipientId: post.author_id,
        actorId: authorId,
        type: 'comment',
        postId,
        commentId: id,
      });
    }
    return id;
  });

  // The row was just inserted, so the assertion is safe.
  const row = await fetchCommentRow(newId);
  return toComment(row!);
}

export async function updateComment(
  commentId: number,
  userId: number,
  input: CommentInput,
): Promise<Comment> {
  await assertCommentOwner(commentId, userId);
  const content = validateContent(input.content);

  await query('UPDATE comments SET content = $1, updated_at = now() WHERE id = $2', [
    content,
    commentId,
  ]);

  const row = await fetchCommentRow(commentId);
  return toComment(row!);
}

export async function deleteComment(commentId: number, userId: number): Promise<void> {
  await assertCommentOwner(commentId, userId);
  await query('DELETE FROM comments WHERE id = $1', [commentId]);
}
