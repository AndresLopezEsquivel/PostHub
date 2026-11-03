import { request } from './client';

// PUT adds and DELETE removes. Both return the new state, not a 204, so the
// caller can replace its optimistic guess with the server's count.
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
