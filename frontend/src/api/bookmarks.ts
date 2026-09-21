import { type Paginated, request } from './client';
import type { PostCard } from './posts';

// The bookmarks resource (docs/api_design.md "Bookmarks"). The toggle is private —
// so its state carries no count, only bookmarkedByMe. The saved-posts list reuses
// the same <postCard> as Explore (its rows are all bookmarkedByMe: true).

// --- API shapes (mirrors backend/src/services/bookmarks.service.ts) ----------

export interface BookmarkState {
  postId: number;
  bookmarkedByMe: boolean;
}

export function bookmarkPost(postId: number): Promise<BookmarkState> {
  return request<BookmarkState>(`/posts/${postId}/bookmark`, { method: 'PUT' });
}

export function unbookmarkPost(postId: number): Promise<BookmarkState> {
  return request<BookmarkState>(`/posts/${postId}/bookmark`, { method: 'DELETE' });
}

// The session user's saved posts, newest-saved first (GET /api/bookmarks). Auth-only.
export function listBookmarks(
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<Paginated<PostCard>> {
  return request<Paginated<PostCard>>('/bookmarks', { query: params, signal });
}
