import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Unit test: no database. assertPostExists and the like COUNT both go through the
// mocked queryOne; the INSERT/DELETE through query. These handlers are thin, so
// the end-to-end behaviour is proved in tests/integration/likes.test.ts — here we
// just pin the 404 guard, idempotent SQL, and the returned shape.
vi.mock('../db/query', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query, queryOne } from '../db/query';
import { likePost, unlikePost } from './likes.service';

const mockQuery = query as unknown as Mock;
const mockQueryOne = queryOne as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('likePost', () => {
  it('404s when the post does not exist, without inserting', async () => {
    mockQueryOne.mockResolvedValueOnce(null); // assertPostExists → not found
    await expect(likePost(7, 42)).rejects.toMatchObject({ status: 404 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('inserts (idempotent) and returns the fresh count with likedByMe true', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 42 }) // assertPostExists
      .mockResolvedValueOnce({ count: 3 }); // countLikes
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const state = await likePost(7, 42);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO post_likes'),
      [7, 42],
    );
    // ON CONFLICT DO NOTHING is what makes a repeat like a no-op.
    expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT DO NOTHING');
    expect(state).toEqual({ postId: 42, likeCount: 3, likedByMe: true });
  });
});

describe('unlikePost', () => {
  it('deletes and returns likedByMe false with the fresh count', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 42 }) // assertPostExists
      .mockResolvedValueOnce({ count: 0 }); // countLikes
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const state = await unlikePost(7, 42);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM post_likes'),
      [7, 42],
    );
    expect(state).toEqual({ postId: 42, likeCount: 0, likedByMe: false });
  });
});
