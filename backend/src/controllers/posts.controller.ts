import { Request, Response } from 'express';
import * as postsService from '../services/posts.service';
import { notFound, unauthorized } from '../errors/httpError';

// Thin HTTP layer over posts.service. Reads query/params/body and the session
// user; the service owns validation, ownership, and the card shape. No try/catch:
// under Express 5 a rejected promise is forwarded to errorHandler automatically.

// Parse a numeric :postId. A non-numeric segment can't identify a post, so it
// gets the same 404 as a well-formed id that doesn't exist.
function parsePostId(req: Request): number {
  const id = Number(req.params.postId);
  if (!Number.isInteger(id) || id < 1) {
    throw notFound('Post not found');
  }
  return id;
}

// requireAuth guards the write routes, so userId is set; assert it for the type
// and fail closed if that middleware is ever dropped from a route.
function requireUserId(req: Request): number {
  const userId = req.session.userId;
  if (!userId) throw unauthorized('Not authenticated');
  return userId;
}

export async function listPosts(req: Request, res: Response): Promise<void> {
  const { search, category, sort, page, limit } = req.query;
  const result = await postsService.listPosts({ search, category, sort, page, limit });
  res.status(200).json(result);
}

export async function createPost(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const card = await postsService.createPost(userId, req.body ?? {});
  res.status(201).json(card);
}

export async function getPost(req: Request, res: Response): Promise<void> {
  const post = await postsService.getPost(parsePostId(req));
  res.status(200).json(post);
}

export async function updatePost(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const card = await postsService.updatePost(parsePostId(req), userId, req.body ?? {});
  res.status(200).json(card);
}

export async function deletePost(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  await postsService.deletePost(parsePostId(req), userId);
  res.status(204).end();
}
