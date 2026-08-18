import { type Paginated, request } from './client';
import type { PostCard } from './posts';

// The feed resource (docs/api_design.md "Feed"). Auth-only: the session user's
// personalized feed — posts by the authors they follow, newest-first. page/limit
// only, no filters (that's Explore's job). A user who follows no one gets a normal
// 200 empty page, which the Feed screen renders as a call to action.
export function listFeed(
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<Paginated<PostCard>> {
  return request<Paginated<PostCard>>('/feed', { query: params, signal });
}
