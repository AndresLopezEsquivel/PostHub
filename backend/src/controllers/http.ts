import { Request } from 'express';
import { notFound, unauthorized } from '../errors/httpError';

// Request-reading helpers shared by the controllers, so the 401 and 404
// behavior is the same everywhere.

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

// Same, for :notificationId on the /api/notifications routes.
export function parseNotificationId(req: Request): number {
  const id = Number(req.params.notificationId);
  if (!Number.isInteger(id) || id < 1) {
    throw notFound('Notification not found');
  }
  return id;
}

// The :username segment addresses the user routes. It's always a single path
// segment (never an array), but Express types it as string | string[]; coerce to
// a plain string. A missing user is a 404 the service raises when it resolves it.
export function parseUsername(req: Request): string {
  return String(req.params.username);
}

// requireAuth guards the write routes, so userId is set; assert it for the type
// and fail closed if that middleware is ever dropped from a route.
export function requireUserId(req: Request): number {
  const userId = req.session.userId;
  if (!userId) throw unauthorized('Not authenticated');
  return userId;
}

// The viewer for public reads: the session user if logged in, else null. The
// post queries use it to compute likedByMe and bookmarkedByMe.
export function viewerId(req: Request): number | null {
  return req.session.userId ?? null;
}
