import { Request, Response } from 'express';
import * as bookmarksService from '../services/bookmarks.service';
import * as postsService from '../services/posts.service';
import { parsePostId, requireUserId } from './http';

// Thin HTTP layer over bookmarks.service. The two toggles are post-scoped; the
// listing (GET /api/bookmarks) is user-scoped and reuses the posts card renderer
// via postsService.listBookmarks. All three are auth-gated on their routers.

export async function bookmarkPost(req: Request, res: Response): Promise<void> {
  const state = await bookmarksService.bookmarkPost(requireUserId(req), parsePostId(req));
  res.status(200).json(state);
}

export async function unbookmarkPost(req: Request, res: Response): Promise<void> {
  const state = await bookmarksService.unbookmarkPost(requireUserId(req), parsePostId(req));
  res.status(200).json(state);
}

export async function listBookmarks(req: Request, res: Response): Promise<void> {
  const { page, limit } = req.query;
  const result = await postsService.listBookmarks(requireUserId(req), { page, limit });
  res.status(200).json(result);
}
