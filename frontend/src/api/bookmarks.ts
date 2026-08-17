import { request } from './client';

// The bookmarks toggle (docs/api_design.md "Bookmarks"). Structurally identical to
// likes, but private — so the state carries no count, only bookmarkedByMe.
//
// GET /api/bookmarks (the saved-posts list) is deferred to pass 7, when the
// Bookmarks screen lands — added per need, like the backend controllers.

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
