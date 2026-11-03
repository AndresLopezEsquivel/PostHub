import bcrypt from 'bcryptjs';
import { query, queryOne, queryMany, withTransaction } from '../db/query';
import { isUniqueViolation } from '../db/pgErrors';
import { badRequest, conflict, notFound } from '../errors/httpError';
import {
  avatarKeyToUrl,
  normalizePagination,
  listPostsByAuthor,
  type PostList,
} from './posts.service';
import { insertNotification } from './notifications.service';

// Profiles, profile updates and follows. The post, follower and following
// counts are computed with COUNT(*) on each read, never stored, so they can't
// drift.

const BCRYPT_COST = 10;

// Same email rules as registration in auth.service, applied to an email change.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AVATAR_KEY_MAX = 255; // users.avatar_key varchar(255)

export interface UserProfile {
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
}

// A row in a followers or following list. followedByMe drives each row's
// follow button and is false for anonymous viewers.
export interface FollowUser {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  followedByMe: boolean;
}

export interface FollowUserList {
  data: FollowUser[];
  page: number;
  limit: number;
  total: number;
}

// Returned instead of a 204, so the client can update without refetching.
export interface FollowState {
  username: string;
  followedByMe: boolean;
  followerCount: number;
}

// Serves both the public profile (by username) and the re-read after an
// update (by id). The caller supplies the WHERE. $1 is the viewer's id: an
// anonymous viewer binds null, so followed_by_me is false. The COUNTs arrive as
// numbers because of the int8 parser in db/types.ts.
const PROFILE_SELECT = `
  SELECT u.username, u.bio, u.avatar_key, u.created_at,
         (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count,
         (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS follower_count,
         (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following_count,
         EXISTS (SELECT 1 FROM follows f
                  WHERE f.followee_id = u.id AND f.follower_id = $1) AS followed_by_me
  FROM users u
`;

interface ProfileRow {
  username: string;
  bio: string | null;
  avatar_key: string | null;
  created_at: string;
  post_count: number;
  follower_count: number;
  following_count: number;
  followed_by_me: boolean;
}

export function toProfile(row: ProfileRow): UserProfile {
  return {
    username: row.username,
    bio: row.bio,
    avatarUrl: avatarKeyToUrl(row.avatar_key),
    createdAt: row.created_at,
    postCount: row.post_count,
    followerCount: row.follower_count,
    followingCount: row.following_count,
    followedByMe: row.followed_by_me,
  };
}

// `whereSql` is an internal literal (`u.username = $2` / `u.id = $2`), never user
// input; the key value binds through $2, the viewer through $1.
async function fetchProfileRow(
  whereSql: string,
  key: string | number,
  viewerId: number | null,
): Promise<ProfileRow | null> {
  return queryOne<ProfileRow>(`${PROFILE_SELECT} WHERE ${whereSql}`, [viewerId, key]);
}

export async function getUserProfile(
  username: string,
  viewerId: number | null,
): Promise<UserProfile> {
  const row = await fetchProfileRow('u.username = $2', username, viewerId);
  if (!row) throw notFound('User not found');
  return toProfile(row);
}

// Resolve a username to its numeric id, 404ing on a miss so every username-
// addressed endpoint reports a missing user the same way.
async function resolveUserId(username: string): Promise<number> {
  const row = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE username = $1',
    [username],
  );
  if (!row) throw notFound('User not found');
  return row.id;
}

function validateBio(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw badRequest('bio must be a string or null', 'bio');
  }
  const bio = value.trim();
  return bio ? bio : null; // column is text (no max); empty collapses to null
}

function validateEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) throw badRequest('Email is required', 'email');
  if (email.length > 255 || !EMAIL_RE.test(email)) {
    throw badRequest('A valid email is required', 'email');
  }
  return email;
}

function validateAvatarKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw badRequest('avatarKey must be a string or null', 'avatarKey');
  }
  const key = value.trim();
  if (!key) return null;
  if (key.length > AVATAR_KEY_MAX) {
    throw badRequest(`avatarKey must be at most ${AVATAR_KEY_MAX} characters`, 'avatarKey');
  }
  return key;
}

function validatePassword(value: unknown): string {
  const password = typeof value === 'string' ? value : '';
  if (!password) throw badRequest('Password is required', 'password');
  if (password.length < 8 || password.length > 72) {
    throw badRequest('Password must be between 8 and 72 characters', 'password');
  }
  return password;
}

// Updates only the fields present in the body. A username in the body is a
// 400, not silently ignored: usernames can't change, and ignoring it would
// hide a client bug. Changing the email or password doesn't ask for the
// current password.
export async function updateOwnProfile(
  userId: number,
  input: unknown,
): Promise<UserProfile> {
  const body =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  if ('username' in body) {
    throw badRequest('Username cannot be changed', 'username');
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  if ('bio' in body) {
    values.push(validateBio(body.bio));
    sets.push(`bio = $${values.length}`);
  }
  if ('avatarKey' in body) {
    values.push(validateAvatarKey(body.avatarKey));
    sets.push(`avatar_key = $${values.length}`);
  }
  if ('email' in body) {
    values.push(validateEmail(body.email));
    sets.push(`email = $${values.length}`);
  }
  if ('password' in body) {
    values.push(await bcrypt.hash(validatePassword(body.password), BCRYPT_COST));
    sets.push(`password_hash = $${values.length}`);
  }

  if (sets.length > 0) {
    values.push(userId);
    try {
      await query(
        `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
        values,
      );
    } catch (err) {
      // The only UNIQUE column reachable here is email (username can't change).
      if (isUniqueViolation(err)) {
        throw conflict('Email already registered', 'email');
      }
      throw err;
    }
  }

  // Re-read by id, with the user as the viewer, so the response is a full
  // profile.
  const row = await fetchProfileRow('u.id = $2', userId, userId);
  return toProfile(row!);
}

interface FollowUserRow {
  username: string;
  avatar_key: string | null;
  bio: string | null;
  followed_by_me: boolean;
}

export function toFollowUser(row: FollowUserRow): FollowUser {
  return {
    username: row.username,
    avatarUrl: avatarKeyToUrl(row.avatar_key),
    bio: row.bio,
    followedByMe: row.followed_by_me,
  };
}

// Both list endpoints are the same query over the follows edge, differing only in
// which side is the filter (the target) and which is joined to users (the listed
// user). `filterCol`/`joinCol` are internal literals, never user input.
async function listFollowRelation(
  targetId: number,
  filterCol: 'f.follower_id' | 'f.followee_id',
  joinCol: 'f.follower_id' | 'f.followee_id',
  params: { page?: unknown; limit?: unknown },
  viewerId: number | null,
): Promise<FollowUserList> {
  const { page, limit } = normalizePagination(params.page, params.limit);

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM follows f WHERE ${filterCol} = $1`,
    [targetId],
  );
  const total = totalRow?.total ?? 0;

  const offset = (page - 1) * limit;
  const rows = await queryMany<FollowUserRow>(
    `SELECT u.username, u.avatar_key, u.bio,
            EXISTS (SELECT 1 FROM follows vf
                     WHERE vf.followee_id = u.id AND vf.follower_id = $2) AS followed_by_me
       FROM follows f
       JOIN users u ON u.id = ${joinCol}
      WHERE ${filterCol} = $1
      ORDER BY f.created_at DESC, u.id DESC
      LIMIT $3 OFFSET $4`,
    [targetId, viewerId, limit, offset],
  );

  return { data: rows.map(toFollowUser), page, limit, total };
}

// Users who follow username: filter on followee_id, join on follower_id.
export async function listFollowers(
  username: string,
  params: { page?: unknown; limit?: unknown },
  viewerId: number | null,
): Promise<FollowUserList> {
  const targetId = await resolveUserId(username);
  return listFollowRelation(targetId, 'f.followee_id', 'f.follower_id', params, viewerId);
}

// Users that username follows: filter on follower_id, join on followee_id.
export async function listFollowing(
  username: string,
  params: { page?: unknown; limit?: unknown },
  viewerId: number | null,
): Promise<FollowUserList> {
  const targetId = await resolveUserId(username);
  return listFollowRelation(targetId, 'f.follower_id', 'f.followee_id', params, viewerId);
}

export async function listUserPosts(
  username: string,
  params: { page?: unknown; limit?: unknown },
  viewerId: number | null,
): Promise<PostList> {
  const authorId = await resolveUserId(username);
  return listPostsByAuthor(authorId, params, viewerId);
}

// Followers are the rows where the target is the followee. Swapping the
// columns would return the following count instead, with no error.
async function countFollowers(targetId: number): Promise<number> {
  const row = await queryOne<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM follows WHERE followee_id = $1',
    [targetId],
  );
  return row?.count ?? 0;
}

// Idempotent: following someone already followed is not an error. Self-follow is a
// 400, caught here before the DB's follows_no_self_follow CHECK for a clearer error.
export async function followUser(
  followerId: number,
  targetUsername: string,
): Promise<FollowState> {
  const targetId = await resolveUserId(targetUsername);
  if (targetId === followerId) {
    throw badRequest('You cannot follow yourself');
  }
  await withTransaction(async (tx) => {
    // ON CONFLICT DO NOTHING makes a repeat follow a no-op. rowCount is then 0,
    // so only a new follow sends a notification.
    const inserted = await tx.query(
      `INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING follower_id`,
      [followerId, targetId],
    );
    if (inserted.rowCount && inserted.rowCount > 0) {
      // No self-notification check needed: a self-follow is already a 400 above.
      await insertNotification(tx, {
        recipientId: targetId,
        actorId: followerId,
        type: 'follow',
      });
    }
  });
  return {
    username: targetUsername,
    followedByMe: true,
    followerCount: await countFollowers(targetId),
  };
}

// Idempotent: unfollowing someone not followed is a no-op, not an error.
export async function unfollowUser(
  followerId: number,
  targetUsername: string,
): Promise<FollowState> {
  const targetId = await resolveUserId(targetUsername);
  await query(
    'DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2',
    [followerId, targetId],
  );
  return {
    username: targetUsername,
    followedByMe: false,
    followerCount: await countFollowers(targetId),
  };
}
