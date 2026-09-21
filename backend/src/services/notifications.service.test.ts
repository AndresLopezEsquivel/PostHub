import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { HttpError } from '../errors/httpError';

// Unit test: no database. The db/query helpers are mocked; assertRecipient, the
// list, and the mark endpoints route through them. Exercises row→API mapping (the
// null-post follow case), recipient ownership, the isRead validation, and that the
// ?unread filter toggles the WHERE — no DB.
vi.mock('../db/query', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query, queryOne, queryMany } from '../db/query';
import {
  toNotification,
  listNotifications,
  markNotificationRead,
  markAllRead,
} from './notifications.service';

const mockQuery = query as unknown as Mock;
const mockQueryOne = queryOne as unknown as Mock;
const mockQueryMany = queryMany as unknown as Mock;

// The row NOTIFICATION_SELECT returns (actor + optional post joined).
const likeRow = {
  id: 91,
  type: 'like' as const,
  is_read: false,
  created_at: '2026-07-15T18:40:12Z',
  actor_username: 'neo',
  actor_avatar_key: null as string | null,
  post_id: 42,
  post_title: 'On absurdism',
};

const followRow = {
  id: 90,
  type: 'follow' as const,
  is_read: false,
  created_at: '2026-07-15T17:05:44Z',
  actor_username: 'trinity',
  actor_avatar_key: null as string | null,
  post_id: null as number | null,
  post_title: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toNotification', () => {
  it('maps a like row with its post', () => {
    expect(toNotification(likeRow)).toEqual({
      id: 91,
      type: 'like',
      actor: { username: 'neo', avatarUrl: null },
      post: { id: 42, title: 'On absurdism' },
      isRead: false,
      createdAt: '2026-07-15T18:40:12Z',
    });
  });

  it('maps a follow row to a null post', () => {
    expect(toNotification(followRow)).toMatchObject({
      type: 'follow',
      actor: { username: 'trinity', avatarUrl: null },
      post: null,
    });
  });
});

describe('listNotifications', () => {
  it('scopes to the recipient and carries unreadCount, without the unread filter', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ total: 2 }) // total
      .mockResolvedValueOnce({ count: 1 }); // countUnread
    mockQueryMany.mockResolvedValueOnce([likeRow, followRow]);

    const result = await listNotifications(7, {});

    const listSql = mockQueryMany.mock.calls[0][0] as string;
    expect(listSql).toContain('n.recipient_id = $1');
    expect(listSql).not.toContain('is_read = false'); // no unread filter
    expect(result).toMatchObject({ page: 1, limit: 20, total: 2, unreadCount: 1 });
    expect(result.data).toHaveLength(2);
  });

  it('adds the unread predicate when ?unread=true', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ total: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mockQueryMany.mockResolvedValueOnce([likeRow]);

    await listNotifications(7, { unread: 'true' });

    const listSql = mockQueryMany.mock.calls[0][0] as string;
    expect(listSql).toContain('is_read = false');
  });
});

describe('markNotificationRead', () => {
  it('404s when the notification does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    await expect(markNotificationRead(91, 7, true)).rejects.toMatchObject({ status: 404 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('403s when the caller is not the recipient', async () => {
    mockQueryOne.mockResolvedValueOnce({ recipient_id: 99 });
    await expect(markNotificationRead(91, 7, true)).rejects.toMatchObject({ status: 403 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('400s on a non-boolean isRead', async () => {
    mockQueryOne.mockResolvedValueOnce({ recipient_id: 7 });
    const rejection = markNotificationRead(91, 7, 'yes');
    await expect(rejection).rejects.toBeInstanceOf(HttpError);
    await expect(rejection).rejects.toMatchObject({ status: 400, field: 'isRead' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updates and echoes { id, isRead } for the recipient', async () => {
    mockQueryOne.mockResolvedValueOnce({ recipient_id: 7 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await markNotificationRead(91, 7, true);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE notifications SET is_read'),
      [true, 91],
    );
    expect(result).toEqual({ id: 91, isRead: true });
  });
});

describe('markAllRead', () => {
  it('marks the recipient\'s unread rows read and returns unreadCount 0', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });

    const result = await markAllRead(7);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE notifications SET is_read = true'),
      [7],
    );
    expect(result).toEqual({ unreadCount: 0 });
  });
});
