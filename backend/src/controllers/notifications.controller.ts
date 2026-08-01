import { Request, Response } from 'express';
import * as notificationsService from '../services/notifications.service';
import { parseNotificationId, requireUserId } from './http';

// Thin HTTP layer over notifications.service. All three endpoints are auth-only
// (requireAuth on the routes, requireUserId here → 401 without a session); the
// list and read-all are implicitly scoped to the session user, and the per-item
// PATCH is ownership-guarded in the service (403 on someone else's). No try/catch:
// Express 5 forwards a rejected promise to errorHandler.

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { unread, page, limit } = req.query;
  const result = await notificationsService.listNotifications(userId, { unread, page, limit });
  res.status(200).json(result);
}

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const isRead = (req.body ?? {}).isRead;
  const result = await notificationsService.markNotificationRead(
    parseNotificationId(req),
    userId,
    isRead,
  );
  res.status(200).json(result);
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const result = await notificationsService.markAllRead(userId);
  res.status(200).json(result);
}
