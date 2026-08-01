import { Request, Response } from 'express';
import * as postsService from '../services/posts.service';
import { requireUserId } from './http';

// Thin HTTP layer over posts.service.listFeed. The feed is auth-only — requireAuth
// guards the route and requireUserId asserts the session — so a no-session request
// is 401, distinct from an authenticated user who follows no one (200, empty page).
// No try/catch: Express 5 forwards a rejected promise to errorHandler.

export async function getFeed(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { page, limit } = req.query;
  const result = await postsService.listFeed(userId, { page, limit });
  res.status(200).json(result);
}
