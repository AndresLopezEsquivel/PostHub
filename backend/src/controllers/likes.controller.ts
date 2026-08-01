import { Request, Response } from 'express';
import * as likesService from '../services/likes.service';
import { parsePostId, requireUserId } from './http';

// Thin HTTP layer over likes.service. Both routes are auth-gated (requireAuth on
// the router), so requireUserId always resolves; the toggle returns the new state
// (200) rather than 204 so the client updates in place.

export async function likePost(req: Request, res: Response): Promise<void> {
  const state = await likesService.likePost(requireUserId(req), parsePostId(req));
  res.status(200).json(state);
}

export async function unlikePost(req: Request, res: Response): Promise<void> {
  const state = await likesService.unlikePost(requireUserId(req), parsePostId(req));
  res.status(200).json(state);
}
