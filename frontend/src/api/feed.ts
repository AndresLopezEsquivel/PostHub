import { type Paginated, request } from './client';
import type { PostCard } from './posts';

// Posts by the authors the session user follows, newest first. A user who
// follows no one gets an empty page, not an error.
export function listFeed(
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<Paginated<PostCard>> {
  return request<Paginated<PostCard>>('/feed', { query: params, signal });
}
