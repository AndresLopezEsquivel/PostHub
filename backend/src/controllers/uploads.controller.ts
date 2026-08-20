import { Request, Response } from 'express';
import * as uploadsService from '../services/uploads.service';
import { requireUserId } from './http';

// Thin HTTP layer over uploads.service. Auth-only (requireAuth on the route,
// requireUserId here → 401 without a session). No try/catch: Express 5 forwards a
// rejected promise to errorHandler, which renders the service's 400/503.

export async function createUploadUrl(req: Request, res: Response): Promise<void> {
  requireUserId(req);
  const { contentType, purpose } = req.body ?? {};
  const result = await uploadsService.createUploadUrl({ contentType, purpose });
  res.status(200).json(result);
}
