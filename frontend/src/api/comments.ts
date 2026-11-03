import { type Paginated, request } from './client';
import type { Author } from './posts';

// Listing and creating are scoped to a post (/posts/:postId/comments).
// Deleting uses /comments/:id, since a comment id is unique on its own.

// Comments carry no per-viewer state, unlike post cards.
export interface Comment {
  id: number;
  content: string;
  author: Author;
  createdAt: string;
  updatedAt: string | null;
}

export interface CommentInput {
  content: string;
}

export function listPostComments(
  postId: number,
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<Paginated<Comment>> {
  return request<Paginated<Comment>>(`/posts/${postId}/comments`, { query: params, signal });
}

export function createComment(
  postId: number,
  input: CommentInput,
  signal?: AbortSignal,
): Promise<Comment> {
  return request<Comment>(`/posts/${postId}/comments`, { method: 'POST', body: input, signal });
}

export function deleteComment(commentId: number): Promise<void> {
  return request<void>(`/comments/${commentId}`, { method: 'DELETE' });
}
