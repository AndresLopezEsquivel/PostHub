import { request } from './client';

// The likes toggle (docs/api_design.md "Likes"). PUT adds, DELETE removes — both
// idempotent, both auth-gated, and both return the fresh state (not 204) so the
// caller reconciles its optimistic guess against the authoritative count.

// --- API shapes (mirrors backend/src/services/likes.service.ts) --------------

export interface LikeState {
  postId: number;
  likeCount: number;
  likedByMe: boolean;
}

export function likePost(postId: number): Promise<LikeState> {
  return request<LikeState>(`/posts/${postId}/like`, { method: 'PUT' });
}

export function unlikePost(postId: number): Promise<LikeState> {
  return request<LikeState>(`/posts/${postId}/like`, { method: 'DELETE' });
}
