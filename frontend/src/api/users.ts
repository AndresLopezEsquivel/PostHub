import { type Paginated, request } from './client';
import type { PostCard } from './posts';

// No email: it's private and only comes with the session, so Edit profile
// prefills it from useAuth().user.
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

// Includes followedByMe so each row's follow button needs no extra request.
export interface FollowUser {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  followedByMe: boolean;
}

// Returned instead of a 204 so the client can update in place.
export interface FollowState {
  username: string;
  followedByMe: boolean;
  followerCount: number;
}

// No username: it can't be changed, and the backend rejects it with a 400.
export interface UpdateProfileInput {
  bio?: string | null;
  email?: string;
  password?: string;
  avatarKey?: string | null;
}

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

export function updateOwnProfile(input: UpdateProfileInput): Promise<UserProfile> {
  return request<UserProfile>('/users/me', { method: 'PATCH', body: input });
}

export function followUser(username: string): Promise<FollowState> {
  return request<FollowState>(`/users/${username}/follow`, { method: 'PUT' });
}

export function unfollowUser(username: string): Promise<FollowState> {
  return request<FollowState>(`/users/${username}/follow`, { method: 'DELETE' });
}
