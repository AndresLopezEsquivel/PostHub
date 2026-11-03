import { request } from './client';
import type { Author } from './posts';

export type NotificationType = 'like' | 'comment' | 'follow';

// The post a like or comment points at; null for a follow.
export interface NotificationPost {
  id: number;
  title: string;
}

export interface NotificationItem {
  id: number;
  type: NotificationType;
  actor: Author;
  post: NotificationPost | null;
  isRead: boolean;
  createdAt: string;
}

// unreadCount comes with the list, so the nav badge needs no separate
// request. It counts all unread notifications, even when the list is
// filtered with ?unread.
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
