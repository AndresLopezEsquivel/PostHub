import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { HttpError } from '../errors/httpError';

// Unit test: no database. The db/query helpers are mocked; resolveUserId and the
// profile/follow queries all route through the mocked query/queryOne. Exercises
// mapping, profile-update validation, the email-conflict mapping, and the follow
// toggle's self-follow guard — no DB.
vi.mock('../db/query', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query, queryOne, withTransaction } from '../db/query';
import {
  toProfile,
  toFollowUser,
  getUserProfile,
  updateOwnProfile,
  followUser,
  unfollowUser,
} from './users.service';

const mockQuery = query as unknown as Mock;
const mockQueryOne = queryOne as unknown as Mock;
const mockWithTransaction = withTransaction as unknown as Mock;

// The row PROFILE_SELECT returns (counts + viewer flag joined), not a raw table row.
const sampleProfileRow = {
  username: 'andres',
  bio: 'Reading and building.',
  avatar_key: null as string | null,
  created_at: '2026-01-08T09:14:00Z',
  post_count: 12,
  follower_count: 34,
  following_count: 19,
  followed_by_me: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toProfile', () => {
  it('maps a row to the documented <profile> shape', () => {
    expect(toProfile(sampleProfileRow)).toEqual({
      username: 'andres',
      bio: 'Reading and building.',
      avatarUrl: null, // avatarUrl null until step 9
      createdAt: '2026-01-08T09:14:00Z',
      postCount: 12,
      followerCount: 34,
      followingCount: 19,
      followedByMe: false,
    });
  });
});

describe('toFollowUser', () => {
  it('maps a row to <user> + bio + followedByMe', () => {
    expect(
      toFollowUser({
        username: 'neo',
        avatar_key: null,
        bio: 'hi',
        followed_by_me: true,
      }),
    ).toEqual({ username: 'neo', avatarUrl: null, bio: 'hi', followedByMe: true });
  });
});

describe('getUserProfile', () => {
  it('returns the mapped profile when the user exists', async () => {
    mockQueryOne.mockResolvedValueOnce(sampleProfileRow);
    const profile = await getUserProfile('andres', 7);
    expect(profile).toMatchObject({ username: 'andres', followerCount: 34 });
  });

  it('404s when the user does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    await expect(getUserProfile('ghost', null)).rejects.toMatchObject({ status: 404 });
  });
});

describe('updateOwnProfile', () => {
  it('rejects a username in the body with a 400, without writing', async () => {
    const rejection = updateOwnProfile(7, { username: 'newname' });
    await expect(rejection).rejects.toBeInstanceOf(HttpError);
    await expect(rejection).rejects.toMatchObject({ status: 400, field: 'username' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['bad email', { email: 'not-an-email' }, 'email'],
    ['non-string bio', { bio: 123 }, 'bio'],
    ['short password', { password: 'short' }, 'password'],
  ])('rejects %s with a 400 on the right field, without writing', async (_label, body, field) => {
    await expect(updateOwnProfile(7, body)).rejects.toMatchObject({ status: 400, field });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updates a present field then re-reads and returns the profile', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE
    mockQueryOne.mockResolvedValueOnce({ ...sampleProfileRow, bio: 'Revised.' }); // re-read

    const profile = await updateOwnProfile(7, { bio: 'Revised.' });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET bio ='),
      ['Revised.', 7],
    );
    expect(profile.bio).toBe('Revised.');
  });

  it('maps a unique violation on email to a 409', async () => {
    mockQuery.mockRejectedValueOnce({ code: '23505', constraint: 'users_email_key' });
    await expect(updateOwnProfile(7, { email: 'taken@example.com' })).rejects.toMatchObject({
      status: 409,
      field: 'email',
    });
  });

  it('no-ops on an empty body, returning the current profile without an UPDATE', async () => {
    mockQueryOne.mockResolvedValueOnce(sampleProfileRow); // re-read only
    const profile = await updateOwnProfile(7, {});
    expect(mockQuery).not.toHaveBeenCalled();
    expect(profile.username).toBe('andres');
  });
});

describe('followUser', () => {
  it('400s on a self-follow, without opening a transaction', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 7 }); // resolveUserId → same as follower
    await expect(followUser(7, 'self')).rejects.toMatchObject({ status: 400 });
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('404s when the target does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null); // resolveUserId miss
    await expect(followUser(7, 'ghost')).rejects.toMatchObject({ status: 404 });
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('inserts the edge, notifies the target, and returns the recomputed count', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 42 }) // resolveUserId
      .mockResolvedValueOnce({ count: 35 }); // countFollowers
    const tx = { query: vi.fn().mockResolvedValue({ rows: [{ follower_id: 7 }], rowCount: 1 }) };
    mockWithTransaction.mockImplementation(async (fn) => fn(tx));

    const state = await followUser(7, 'andres');

    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO follows'),
      [7, 42],
    );
    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining([42, 7, 'follow']),
    );
    expect(state).toEqual({ username: 'andres', followedByMe: true, followerCount: 35 });
  });

  it('does not notify on a repeat follow (no row inserted)', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 42 }) // resolveUserId
      .mockResolvedValueOnce({ count: 35 }); // countFollowers
    const tx = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }; // ON CONFLICT: nothing new
    mockWithTransaction.mockImplementation(async (fn) => fn(tx));

    await followUser(7, 'andres');

    expect(tx.query).toHaveBeenCalledTimes(1); // follow insert only, no notification
  });
});

describe('unfollowUser', () => {
  it('deletes the edge and returns followedByMe false with the recomputed count', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 42 }) // resolveUserId
      .mockResolvedValueOnce({ count: 34 }); // countFollowers
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE

    const state = await unfollowUser(7, 'andres');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM follows'),
      [7, 42],
    );
    expect(state).toEqual({ username: 'andres', followedByMe: false, followerCount: 34 });
  });
});
