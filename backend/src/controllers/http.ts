import { Request } from 'express';
import { notFound, unauthorized } from '../errors/httpError';

// Small request-reading helpers shared across the post-scoped controllers
// (posts, likes, bookmarks). They keep the HTTP layer thin and the 401/404
// semantics identical everywhere.

// Parse a numeric :postId. A non-numeric segment can't identify a post, so it
// gets the same 404 as a well-formed id that doesn't exist.
export function parsePostId(req: Request): number {
  const id = Number(req.params.postId);
  if (!Number.isInteger(id) || id < 1) {
    throw notFound('Post not found');
  }
  return id;
}

// Same, for :commentId on the top-level /api/comments routes.
export function parseCommentId(req: Request): number {
  const id = Number(req.params.commentId);
  if (!Number.isInteger(id) || id < 1) {
    throw notFound('Comment not found');
  }
  return id;
}

// requireAuth guards the write routes, so userId is set; assert it for the type
// and fail closed if that middleware is ever dropped from a route.
export function requireUserId(req: Request): number {
  const userId = req.session.userId;
  if (!userId) throw unauthorized('Not authenticated');
  return userId;
}

// The viewer for public reads: the session user if logged in, else null. The
// card serializer uses it to derive likedByMe/bookmarkedByMe.
export function viewerId(req: Request): number | null {
  return req.session.userId ?? null;
}
