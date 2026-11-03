import { PoolClient } from 'pg';
import { query, queryOne, queryMany } from '../db/query';
import { badRequest, forbidden, notFound } from '../errors/httpError';
import { NotificationType } from '../types/db';
import { Author, avatarKeyToUrl, normalizePagination } from './posts.service';

// Two jobs: the read and mark-read endpoints for the recipient, and
// insertNotification, which likes, comments and follows call inside their own
// transactions. The actor has the same shape as a post card's author, so the
// mapping and avatar URL come from posts.service.

// null for a follow, which has no post_id.
export interface NotificationPost {
  id: number;
  title: string;
}

// comment_id is stored but not returned: the list only shows the post.
export interface NotificationItem {
  id: number;
  type: NotificationType;
  actor: Author;
  post: NotificationPost | null;
  isRead: boolean;
  createdAt: string;
}

// The list envelope carries unreadCount alongside the usual pagination fields, so
// the navbar badge needs no second request.
export interface NotificationList {
  data: NotificationItem[];
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
}

// One SELECT serves the list. posts is LEFT JOINed because a follow has no
// post_id, so post_id and post_title come back null.
const NOTIFICATION_SELECT = `
  SELECT n.id, n.type, n.is_read, n.created_at,
         au.username AS actor_username, au.avatar_key AS actor_avatar_key,
         p.id AS post_id, p.title AS post_title
  FROM notifications n
  JOIN users au ON au.id = n.actor_id
  LEFT JOIN posts p ON p.id = n.post_id
`;

// What NOTIFICATION_SELECT returns, with the actor and post joined in.
// NotificationRow in types/db.ts is the raw table row.
interface NotificationJoinRow {
  id: number;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
  actor_username: string;
  actor_avatar_key: string | null;
  post_id: number | null;
  post_title: string | null;
}

export function toNotification(row: NotificationJoinRow): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    actor: {
      username: row.actor_username,
      avatarUrl: avatarKeyToUrl(row.actor_avatar_key),
    },
    // posts.title is NOT NULL, so post_title is set whenever post_id is.
    post: row.post_id === null ? null : { id: row.post_id, title: row.post_title! },
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

async function countUnread(userId: number): Promise<number> {
  const row = await queryOne<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE recipient_id = $1 AND is_read = false',
    [userId],
  );
  return row?.count ?? 0;
}

export interface ListParams {
  unread?: unknown;
  page?: unknown;
  limit?: unknown;
}

export async function listNotifications(
  userId: number,
  params: ListParams,
): Promise<NotificationList> {
  const { page, limit } = normalizePagination(params.page, params.limit);
  // `?unread=true` narrows the page (and its total) to unread rows; unreadCount is
  // always the full unread tally for the badge, regardless of this filter.
  const unreadOnly = params.unread === 'true';
  const where = unreadOnly
    ? 'WHERE n.recipient_id = $1 AND n.is_read = false'
    : 'WHERE n.recipient_id = $1';

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM notifications n ${where}`,
    [userId],
  );
  const total = totalRow?.total ?? 0;

  const offset = (page - 1) * limit;
  const rows = await queryMany<NotificationJoinRow>(
    `${NOTIFICATION_SELECT} ${where} ORDER BY n.created_at DESC, n.id DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  return {
    data: rows.map(toNotification),
    page,
    limit,
    total,
    unreadCount: await countUnread(userId),
  };
}

// Ownership here is recipient_id, not author_id. 404 if the notification is
// gone, 403 if it is addressed to someone else.
async function assertRecipient(notificationId: number, userId: number): Promise<void> {
  const row = await queryOne<{ recipient_id: number }>(
    'SELECT recipient_id FROM notifications WHERE id = $1',
    [notificationId],
  );
  if (!row) throw notFound('Notification not found');
  if (row.recipient_id !== userId) {
    throw forbidden('This notification is not yours');
  }
}

export interface MarkReadResult {
  id: number;
  isRead: boolean;
}

export async function markNotificationRead(
  notificationId: number,
  userId: number,
  isRead: unknown,
): Promise<MarkReadResult> {
  await assertRecipient(notificationId, userId);
  if (typeof isRead !== 'boolean') {
    throw badRequest('isRead must be a boolean', 'isRead');
  }
  await query('UPDATE notifications SET is_read = $1 WHERE id = $2', [isRead, notificationId]);
  return { id: notificationId, isRead };
}

export async function markAllRead(userId: number): Promise<{ unreadCount: number }> {
  await query(
    'UPDATE notifications SET is_read = true WHERE recipient_id = $1 AND is_read = false',
    [userId],
  );
  return { unreadCount: 0 };
}

export interface NotificationInput {
  recipientId: number;
  actorId: number;
  type: NotificationType;
  postId?: number | null;
  commentId?: number | null;
}

// Takes the caller's transaction client, so the like, comment or follow and
// its notification commit or roll back together. Callers skip
// self-notifications and repeats.
export async function insertNotification(
  tx: PoolClient,
  input: NotificationInput,
): Promise<void> {
  await tx.query(
    `INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.recipientId, input.actorId, input.type, input.postId ?? null, input.commentId ?? null],
  );
}
