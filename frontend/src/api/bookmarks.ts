import { type Paginated, request } from './client';
import type { PostCard } from './posts';

// Bookmarks are private, so the state has no count, only bookmarkedByMe.
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

// The session user's saved posts, most recently saved first.
export function listBookmarks(
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<Paginated<PostCard>> {
  return request<Paginated<PostCard>>('/bookmarks', { query: params, signal });
}
