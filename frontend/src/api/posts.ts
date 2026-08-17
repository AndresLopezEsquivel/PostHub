import { type Paginated, request } from './client';

// The posts resource (docs/api_design.md "Posts"). This pass only reads the list;
// getPost/createPost/updatePost/deletePost land with their screens (passes 3 and 5).

// --- API shapes (mirrors backend/src/services/posts.service.ts) --------------

export interface Author {
  username: string;
  // Always null until pass 9 wires S3 — avatarKeyToUrl() returns null today, so no
  // endpoint carries a real avatar URL yet. The card renders no image while it is null.
  avatarUrl: string | null;
}

export interface CategoryTag {
  name: string;
  slug: string;
}

// The list card, exactly as documented under "<postCard>". likedByMe/bookmarkedByMe
// are false for anonymous viewers; the interactive toggles that consume them are pass 4.
export interface PostCard {
  id: number;
  title: string;
  excerpt: string;
  author: Author;
  categories: CategoryTag[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  createdAt: string;
}

export type SortOrder = 'newest' | 'likes';

// Every filter Explore binds to the URL. All optional; request()'s `query` drops
// undefined entries, so an unset filter simply isn't sent. `category` is a single
// slug (the backend takes one, not a list). A `type` (not `interface`) so it stays
// assignable to request()'s `Record<string, …>` query param — an interface would
// lack the required index signature.
export type ListParams = {
  search?: string;
  category?: string;
  sort?: SortOrder;
  page?: number;
  limit?: number;
};

export function listPosts(params: ListParams = {}, signal?: AbortSignal): Promise<Paginated<PostCard>> {
  return request<Paginated<PostCard>>('/posts', { query: params, signal });
}
