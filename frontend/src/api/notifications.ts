import { request } from './client';
import type { Author } from './posts';

// The notifications resource (docs/api_design.md "Notifications"). All auth-only.
// Rows are produced as side effects of likes/comments/follows; this module only
// reads them and marks them read.

// --- API shapes (mirrors backend/src/services/notifications.service.ts) -------

export type NotificationType = 'like' | 'comment' | 'follow';

// The post a like/comment points at; null for a follow (which has no post).
export interface NotificationPost {
  id: number;
  title: string;
}

// The actor is the same <user> as a post card's author.
export interface NotificationItem {
  id: number;
  type: NotificationType;
  actor: Author;
  post: NotificationPost | null;
  isRead: boolean;
  createdAt: string;
}

// The list envelope carries unreadCount alongside pagination, so the nav badge
// needs no separate count request. unreadCount is the FULL unread tally, unaffected
// by the ?unread filter.
export interface NotificationList {
  data: NotificationItem[];
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
}

export interface MarkReadResult {
  id: number;
  isRead: boolean;
}

export function listNotifications(
  params: { unread?: boolean; page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationList> {
  return request<NotificationList>('/notifications', { query: params, signal });
}

export function markNotificationRead(id: number, isRead: boolean): Promise<MarkReadResult> {
  return request<MarkReadResult>(`/notifications/${id}`, { method: 'PATCH', body: { isRead } });
}

export function markAllRead(): Promise<{ unreadCount: number }> {
  return request<{ unreadCount: number }>('/notifications/read-all', { method: 'POST' });
}
