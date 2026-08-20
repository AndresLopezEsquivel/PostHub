import { type Paginated, request } from './client';
import type { Author } from './posts';

// The comments resource (docs/api_design.md "Comments"). Two path shapes, mirroring
// the backend's two routers: the LIST and CREATE are post-scoped
// (/posts/:postId/comments), while DELETE is comment-scoped (/comments/:id) because
// a comment id is globally unique and the post is redundant there.
//
// updateComment (PATCH /comments/:id) is intentionally absent: screens.md §5 lists
// only "delete comment", so editing waits until a screen needs it — same "add per
// need" discipline as the backend controllers.

// --- API shapes (mirrors backend/src/services/comments.service.ts) -----------

// The <comment> author is the same <user> as a post card's, so Author is reused
// from api/posts.ts rather than re-declared. Comments carry no per-viewer state.
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
  return request<void>(`/comments/${commentId}`, { method: 'DELETE' }); // 204
}
