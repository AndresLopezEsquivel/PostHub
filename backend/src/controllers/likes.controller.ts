import { Request, Response } from 'express';
import * as likesService from '../services/likes.service';
import { parsePostId, requireUserId } from './http';

// The toggles return the new state with a 200, not a 204, so the client can
// update in place.

export async function likePost(req: Request, res: Response): Promise<void> {
  const state = await likesService.likePost(requireUserId(req), parsePostId(req));
  res.status(200).json(state);
}

export async function unlikePost(req: Request, res: Response): Promise<void> {
  const state = await likesService.unlikePost(requireUserId(req), parsePostId(req));
  res.status(200).json(state);
}
