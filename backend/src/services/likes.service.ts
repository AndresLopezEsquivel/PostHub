import { query, queryOne, withTransaction } from '../db/query';
import { isForeignKeyViolation } from '../db/pgErrors';
import { notFound } from '../errors/httpError';
import { assertPostExists } from './posts.service';
import { insertNotification } from './notifications.service';

// The row's existence is the like, so liking is an INSERT and unliking a
// DELETE, and both are safe to repeat. Each returns the new count and state,
// so the client can update without refetching.

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
  // This SELECT is both the existence check (404 if missing) and the lookup of
  // the post author, who gets the notification.
  const post = await queryOne<{ author_id: number }>(
    'SELECT author_id FROM posts WHERE id = $1',
    [postId],
  );
  if (!post) throw notFound('Post not found');

  try {
    await withTransaction(async (tx) => {
      // ON CONFLICT DO NOTHING makes a repeat like a no-op. rowCount is then 0, so
      // only a new like sends a notification.
      const inserted = await tx.query(
        `INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING user_id`,
        [userId, postId],
      );
      // Notify the author on a new like, but never notify yourself.
      if (inserted.rowCount && inserted.rowCount > 0 && post.author_id !== userId) {
        await insertNotification(tx, {
          recipientId: post.author_id,
          actorId: userId,
          type: 'like',
          postId,
        });
      }
    });
  } catch (err) {
    // The post was deleted between the check and the insert: 404, not 500.
    if (isForeignKeyViolation(err)) throw notFound('Post not found');
    throw err;
  }
  return { postId, likeCount: await countLikes(postId), likedByMe: true };
}

export async function unlikePost(userId: number, postId: number): Promise<LikeState> {
  await assertPostExists(postId);
  await query('DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
  return { postId, likeCount: await countLikes(postId), likedByMe: false };
}
