import { query } from '../db/query';
import { isForeignKeyViolation } from '../db/pgErrors';
import { notFound } from '../errors/httpError';
import { assertPostExists } from './posts.service';

// Bookmarks: structurally identical to likes (idempotent PUT/DELETE toggle over a
// composite-PK table), but private — so no count is returned, only the resulting
// state (docs/api_design.md "Bookmarks"). Listing the session user's saved posts
// lives in posts.service (listBookmarks), next to the shared card renderer.
//
// No req/res/session here; the session user arrives as a plain `userId`.

export interface BookmarkState {
  postId: number;
  bookmarkedByMe: boolean;
}

export async function bookmarkPost(userId: number, postId: number): Promise<BookmarkState> {
  await assertPostExists(postId);
  try {
    await query(
      `INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, postId],
    );
  } catch (err) {
    // Post deleted between the existence check and the insert → 404, not a 500.
    if (isForeignKeyViolation(err)) throw notFound('Post not found');
    throw err;
  }
  return { postId, bookmarkedByMe: true };
}

export async function unbookmarkPost(userId: number, postId: number): Promise<BookmarkState> {
  await assertPostExists(postId);
  await query('DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2', [userId, postId]);
  return { postId, bookmarkedByMe: false };
}
