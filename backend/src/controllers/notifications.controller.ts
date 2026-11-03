import { Request, Response } from 'express';
import * as notificationsService from '../services/notifications.service';
import { parseNotificationId, requireUserId } from './http';

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
