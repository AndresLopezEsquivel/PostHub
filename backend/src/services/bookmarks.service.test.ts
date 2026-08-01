import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Unit test: no database. assertPostExists goes through the mocked queryOne, the
// INSERT/DELETE through query. Thin handlers — the end-to-end behaviour (and the
// GET /api/bookmarks listing) is proved in tests/integration/bookmarks.test.ts.
vi.mock('../db/query', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query, queryOne } from '../db/query';
import { bookmarkPost, unbookmarkPost } from './bookmarks.service';

const mockQuery = query as unknown as Mock;
const mockQueryOne = queryOne as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bookmarkPost', () => {
  it('404s when the post does not exist, without inserting', async () => {
    mockQueryOne.mockResolvedValueOnce(null); // assertPostExists → not found
    await expect(bookmarkPost(7, 42)).rejects.toMatchObject({ status: 404 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('inserts (idempotent) and returns bookmarkedByMe true with no count', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 42 }); // assertPostExists
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const state = await bookmarkPost(7, 42);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bookmarks'),
      [7, 42],
    );
    expect(state).toEqual({ postId: 42, bookmarkedByMe: true });
  });
});

describe('unbookmarkPost', () => {
  it('deletes and returns bookmarkedByMe false', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 42 }); // assertPostExists
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const state = await unbookmarkPost(7, 42);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM bookmarks'),
      [7, 42],
    );
    expect(state).toEqual({ postId: 42, bookmarkedByMe: false });
  });
});
