import { Request, Response } from 'express';
import * as postsService from '../services/posts.service';
import { parsePostId, requireUserId, viewerId } from './http';

// Thin HTTP layer over posts.service. Reads query/params/body and the session
// user; the service owns validation, ownership, and the card shape. No try/catch:
// under Express 5 a rejected promise is forwarded to errorHandler automatically.

export async function listPosts(req: Request, res: Response): Promise<void> {
  const { search, category, sort, page, limit } = req.query;
  const result = await postsService.listPosts(
    { search, category, sort, page, limit },
    viewerId(req),
  );
  res.status(200).json(result);
}

export async function createPost(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const card = await postsService.createPost(userId, req.body ?? {});
  res.status(201).json(card);
}

export async function getPost(req: Request, res: Response): Promise<void> {
  const post = await postsService.getPost(parsePostId(req), viewerId(req));
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
