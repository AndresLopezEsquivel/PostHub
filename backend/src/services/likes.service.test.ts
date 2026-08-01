import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Unit test: no database. The post lookup and like COUNT go through the mocked
// queryOne; unlike's DELETE through query; the like insert + its notification run
// inside a mocked withTransaction (a fake tx whose .query we assert on). These
// handlers are thin, so end-to-end behaviour is proved in the integration suite —
// here we pin the 404 guard, the notification firing/suppression policy, and shape.
vi.mock('../db/query', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query, queryOne, withTransaction } from '../db/query';
import { likePost, unlikePost } from './likes.service';

const mockQuery = query as unknown as Mock;
const mockQueryOne = queryOne as unknown as Mock;
const mockWithTransaction = withTransaction as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('likePost', () => {
  it('404s when the post does not exist, without opening a transaction', async () => {
    mockQueryOne.mockResolvedValueOnce(null); // SELECT author_id → not found
    await expect(likePost(7, 42)).rejects.toMatchObject({ status: 404 });
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('inserts the like and notifies the author on a new like', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ author_id: 9 }) // post author (not the liker)
      .mockResolvedValueOnce({ count: 3 }); // countLikes
    const tx = { query: vi.fn().mockResolvedValue({ rows: [{ user_id: 7 }], rowCount: 1 }) };
    mockWithTransaction.mockImplementation(async (fn) => fn(tx));

    const state = await likePost(7, 42);

    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO post_likes'),
      [7, 42],
    );
    // ON CONFLICT DO NOTHING is what makes a repeat like a no-op.
    expect(tx.query.mock.calls[0][0]).toContain('ON CONFLICT DO NOTHING');
    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining([9, 7, 'like']),
    );
    expect(state).toEqual({ postId: 42, likeCount: 3, likedByMe: true });
  });

  it('does not notify on a self-like', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ author_id: 7 }) // author IS the liker
      .mockResolvedValueOnce({ count: 1 });
    const tx = { query: vi.fn().mockResolvedValue({ rows: [{ user_id: 7 }], rowCount: 1 }) };
    mockWithTransaction.mockImplementation(async (fn) => fn(tx));

    await likePost(7, 42);

    expect(tx.query).toHaveBeenCalledTimes(1); // like insert only, no notification
  });

  it('does not notify on a repeat like (no row inserted)', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ author_id: 9 })
      .mockResolvedValueOnce({ count: 3 });
    const tx = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }; // ON CONFLICT: nothing new
    mockWithTransaction.mockImplementation(async (fn) => fn(tx));

    await likePost(7, 42);

    expect(tx.query).toHaveBeenCalledTimes(1); // like insert only
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
