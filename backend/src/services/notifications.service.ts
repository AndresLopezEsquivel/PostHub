import { PoolClient } from 'pg';
import { query, queryOne, queryMany } from '../db/query';
import { badRequest, forbidden, notFound } from '../errors/httpError';
import { NotificationType } from '../types/db';
import { Author, avatarKeyToUrl, normalizePagination } from './posts.service';

// Notifications data access + validation + row→API mapping. Like the other
// services it holds no req/res/session: the session user arrives as a plain
// `userId`. Two jobs live here: the recipient-scoped read/mark endpoints, and the
// shared `insertNotification` that the like/comment/follow producers call inside
// their own transactions to record a side-effect notification.
//
// The <notification> actor is the same <user> as a post card's author, so the
// author mapping and avatar-URL construction are reused from posts.service.

// --- API shapes (camelCase, client-facing) -------------------------------

// The post a notification points at — { id, title } for like/comment, null for
// follow (the echo of the nullable post_id column).
export interface NotificationPost {
  id: number;
  title: string;
}

// docs/api_design.md "Notifications" — <notification>. comment_id is stored on the
// row but deliberately not echoed; the list shows only the post.
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

// --- The shared notification query --------------------------------------

// One SELECT feeds the list (single source of the shape). The actor is joined in;
// posts is LEFT JOINed because post_id is nullable — a follow notification has no
// post, so post_id/post_title come back null and map to `post: null`.
const NOTIFICATION_SELECT = `
  SELECT n.id, n.type, n.is_read, n.created_at,
         au.username AS actor_username, au.avatar_key AS actor_avatar_key,
         p.id AS post_id, p.title AS post_title
  FROM notifications n
  JOIN users au ON au.id = n.actor_id
  LEFT JOIN posts p ON p.id = n.post_id
`;

// The row shape the SELECT returns (actor + optional post joined) — distinct from
// types/db.ts NotificationRow, which mirrors the raw table.
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
    // post_id null (a follow) → post null; otherwise both columns are present.
    post: row.post_id === null ? null : { id: row.post_id, title: row.post_title! },
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

// --- Reads ---------------------------------------------------------------

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

// --- Mark read -----------------------------------------------------------

// Ownership guard, keyed on recipient_id (not author_id — notifications are the one
// place ownership means "addressed to me"). 404 if gone, 403 if someone else's.
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

// --- Producer helper -----------------------------------------------------

export interface NotificationInput {
  recipientId: number;
  actorId: number;
  type: NotificationType;
  postId?: number | null;
  commentId?: number | null;
}

// Record a notification as part of the producing action's transaction. Takes the
// transaction client so the like/comment/follow insert and this insert commit
// together (or roll back together). The caller decides whether to call it at all
// (self-notifications and repeat toggles are suppressed upstream).
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
