import { Request, Response } from 'express';
import * as commentsService from '../services/comments.service';
import { parsePostId, parseCommentId, requireUserId } from './http';

// Thin HTTP layer over comments.service. The list/create routes are post-scoped
// (:postId from the parent mount, mergeParams); update/delete are comment-scoped
// (:commentId). No viewer threading — comments carry no per-viewer state.

export async function listPostComments(req: Request, res: Response): Promise<void> {
  const { page, limit } = req.query;
  const result = await commentsService.listPostComments(parsePostId(req), { page, limit });
  res.status(200).json(result);
}

export async function createComment(req: Request, res: Response): Promise<void> {
  const comment = await commentsService.createComment(
    parsePostId(req),
    requireUserId(req),
    req.body ?? {},
  );
  res.status(201).json(comment);
}

export async function updateComment(req: Request, res: Response): Promise<void> {
  const comment = await commentsService.updateComment(
    parseCommentId(req),
    requireUserId(req),
    req.body ?? {},
  );
  res.status(200).json(comment);
}

export async function deleteComment(req: Request, res: Response): Promise<void> {
  await commentsService.deleteComment(parseCommentId(req), requireUserId(req));
  res.status(204).end();
}
