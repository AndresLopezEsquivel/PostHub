import { type Paginated, request } from './client';
import type { PostCard } from './posts';

// The users + follows resource (docs/api_design.md "Users and follows").

// --- API shapes (mirrors backend/src/services/users.service.ts) --------------

// The public profile. Note what is NOT here: no email — it's private, carried only
// in the session (GET /api/auth/session), which is why Edit profile prefills email
// from useAuth().user rather than from this shape.
export interface UserProfile {
  username: string;
  bio: string | null;
  avatarUrl: string | null; // null until pass 9 wires S3
  createdAt: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
}

// A row in a followers/following list: the shared <user> plus bio plus the
// viewer-relative followedByMe, so each row's follow button needs no second request.
export interface FollowUser {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  followedByMe: boolean;
}

// The target's new state after a follow/unfollow — returned instead of 204 so the
// client updates in place.
export interface FollowState {
  username: string;
  followedByMe: boolean;
  followerCount: number;
}

// Partial update of the session user's own profile. avatarKey is accepted by the
// backend but not sent this pass (pass 9); username is absent on purpose — it's
// immutable, and sending it is a 400.
export interface UpdateProfileInput {
  bio?: string | null;
  email?: string;
  password?: string;
  avatarKey?: string | null;
}

// --- Requests ----------------------------------------------------------------

export function getUserProfile(username: string, signal?: AbortSignal): Promise<UserProfile> {
  return request<UserProfile>(`/users/${username}`, { signal });
}

export function listUserPosts(
  username: string,
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<Paginated<PostCard>> {
  return request<Paginated<PostCard>>(`/users/${username}/posts`, { query: params, signal });
}

export function listFollowers(
  username: string,
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<Paginated<FollowUser>> {
  return request<Paginated<FollowUser>>(`/users/${username}/followers`, { query: params, signal });
}

export function listFollowing(
  username: string,
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<Paginated<FollowUser>> {
  return request<Paginated<FollowUser>>(`/users/${username}/following`, { query: params, signal });
}

// PATCH /users/me — the target is the session user (no :username). Answers with the
// <profile> shape.
export function updateOwnProfile(input: UpdateProfileInput): Promise<UserProfile> {
  return request<UserProfile>('/users/me', { method: 'PATCH', body: input });
}

export function followUser(username: string): Promise<FollowState> {
  return request<FollowState>(`/users/${username}/follow`, { method: 'PUT' });
}

export function unfollowUser(username: string): Promise<FollowState> {
  return request<FollowState>(`/users/${username}/follow`, { method: 'DELETE' });
}
