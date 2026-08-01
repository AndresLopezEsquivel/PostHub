import { query, queryOne } from '../db/query';
import { isForeignKeyViolation } from '../db/pgErrors';
import { notFound } from '../errors/httpError';
import { assertPostExists } from './posts.service';

// Likes: an idempotent toggle over the post_likes composite-PK table. The row's
// existence *is* the like, so "like" is an INSERT and "unlike" a DELETE — both
// safe to repeat. Each returns the fresh public count plus the resulting state,
// so the client re-renders without a refetch (docs/api_design.md "Likes").
//
// No req/res/session here; the session user arrives as a plain `userId`.

export interface LikeState {
  postId: number;
  likeCount: number;
  likedByMe: boolean;
}

async function countLikes(postId: number): Promise<number> {
  const row = await queryOne<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1',
    [postId],
  );
  return row?.count ?? 0;
}

export async function likePost(userId: number, postId: number): Promise<LikeState> {
  await assertPostExists(postId);
  try {
    // ON CONFLICT DO NOTHING makes a repeat like a no-op — liking twice isn't an error.
    await query(
      `INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, postId],
    );
  } catch (err) {
    // The post could be deleted between the existence check and the insert; the
    // FK violation means it's gone, so surface the same 404, not a 500.
    if (isForeignKeyViolation(err)) throw notFound('Post not found');
    throw err;
  }
  return { postId, likeCount: await countLikes(postId), likedByMe: true };
}

export async function unlikePost(userId: number, postId: number): Promise<LikeState> {
  await assertPostExists(postId);
  // Deleting a like that isn't there simply affects zero rows — idempotent.
  await query('DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
  return { postId, likeCount: await countLikes(postId), likedByMe: false };
}
