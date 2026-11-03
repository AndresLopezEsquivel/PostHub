import { Request, Response } from 'express';
import * as uploadsService from '../services/uploads.service';
import { requireUserId } from './http';

export async function createUploadUrl(req: Request, res: Response): Promise<void> {
  // The service doesn't need the user id; this only fails closed if
  // requireAuth is ever dropped from the route.
  requireUserId(req);
  const { contentType, purpose } = req.body ?? {};
  const result = await uploadsService.createUploadUrl({ contentType, purpose });
  res.status(200).json(result);
}
