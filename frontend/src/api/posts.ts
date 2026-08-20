import { type Paginated, request } from './client';

// The posts resource (docs/api_design.md "Posts").

// --- API shapes (mirrors backend/src/services/posts.service.ts) --------------

export interface Author {
  username: string;
  // The avatar's public (CloudFront) URL, or null when the user has no avatar or
  // S3_PUBLIC_BASE_URL is unconfigured. Pass 9 renders it; render nothing while null.
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

// Post detail = the card plus the full body and the fields the detail/edit screens
// need. imageKey is the raw S3 key the edit form resends unchanged; imageUrl is its
// resolved public (CloudFront) URL for rendering, null when there is no image or
// S3_PUBLIC_BASE_URL is unconfigured. Pass 9 renders imageUrl; updatedAt is null
// until the post is edited.
export interface PostDetail extends PostCard {
  content: string;
  imageKey: string | null;
  imageUrl: string | null;
  updatedAt: string | null;
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

// A missing post answers 404, which request() turns into an ApiError the detail
// screen renders as its own "post not found" state (not the NotFound route).
export function getPost(id: number, signal?: AbortSignal): Promise<PostDetail> {
  return request<PostDetail>(`/posts/${id}`, { signal });
}

// Create/update take category IDS, not the {name,slug} tags a card carries — the
// edit form maps the post's category slugs back to ids via GET /api/categories.
// imageKey is intentionally omitted this pass (pass 9): create leaves it null, and
// a partial PATCH that omits it preserves the stored value, so an edit never drops
// an image it isn't yet able to show.
export interface CreatePostInput {
  title: string;
  content: string;
  categoryIds: number[];
}

// Partial by contract, but the edit form always sends title/content/categoryIds
// (it has them all), so this pass populates every field; the optionality is what
// keeps it honest with the backend's partial PATCH.
export interface UpdatePostInput {
  title?: string;
  content?: string;
  categoryIds?: number[];
}

export function createPost(input: CreatePostInput): Promise<PostCard> {
  return request<PostCard>('/posts', { method: 'POST', body: input });
}

export function updatePost(id: number, input: UpdatePostInput): Promise<PostCard> {
  return request<PostCard>(`/posts/${id}`, { method: 'PATCH', body: input });
}

export function deletePost(id: number): Promise<void> {
  return request<void>(`/posts/${id}`, { method: 'DELETE' }); // 204
}
