import { Request, Response } from 'express';
import * as postsService from '../services/posts.service';
import { requireUserId } from './http';

// A request with no session gets a 401. A logged-in user who follows no one
// gets a 200 with an empty page, so the client can tell the two apart.

export async function getFeed(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { page, limit } = req.query;
  const result = await postsService.listFeed(userId, { page, limit });
  res.status(200).json(result);
}
