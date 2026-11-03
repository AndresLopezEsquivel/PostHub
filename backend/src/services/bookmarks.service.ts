import { query } from '../db/query';
import { isForeignKeyViolation } from '../db/pgErrors';
import { notFound } from '../errors/httpError';
import { assertPostExists } from './posts.service';

// Bookmarks work like likes, but they are private, so no count is returned,
// only the new state. Listing a user's saved posts is listBookmarks in
// posts.service, next to the other post card listings.

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
    // The post was deleted between the check and the insert: 404, not 500.
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
