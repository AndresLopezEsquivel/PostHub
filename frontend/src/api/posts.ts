import { type Paginated, request } from './client';

export interface Author {
  username: string;
  // Public URL of the avatar; null when the user has no avatar or
  // S3_PUBLIC_BASE_URL is unset.
  avatarUrl: string | null;
}

export interface CategoryTag {
  name: string;
  slug: string;
}

// likedByMe and bookmarkedByMe are false for anonymous viewers.
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

// imageKey is the stored S3 key and imageUrl its public URL, null when there
// is no image or S3_PUBLIC_BASE_URL is unset. updatedAt is null until the
// post is edited.
export interface PostDetail extends PostCard {
  content: string;
  imageKey: string | null;
  imageUrl: string | null;
  updatedAt: string | null;
}

export type SortOrder = 'newest' | 'likes';

// category is a single slug; the backend filters by one. This is a type, not
// an interface, so it fits request()'s Record<string, ...> query: an
// interface has no index signature.
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

// A missing post is a 404 ApiError, which the detail screen shows as its own
// "not found" state instead of the NotFound route.
export function getPost(id: number, signal?: AbortSignal): Promise<PostDetail> {
  return request<PostDetail>(`/posts/${id}`, { signal });
}

// Create and update take category ids, not the name/slug tags a card has;
// the edit form maps the post's slugs back to ids using GET /api/categories.
// imageKey is the key from uploadImage: a string sets the image, null
// removes it, and leaving it out of a PATCH keeps the current one.
export interface CreatePostInput {
  title: string;
  content: string;
  categoryIds: number[];
  imageKey?: string | null;
}

// Every field is optional because PATCH is a partial update. The edit form
// only sends imageKey when the image changed.
export interface UpdatePostInput {
  title?: string;
  content?: string;
  categoryIds?: number[];
  imageKey?: string | null;
}

export function createPost(input: CreatePostInput): Promise<PostCard> {
  return request<PostCard>('/posts', { method: 'POST', body: input });
}

export function updatePost(id: number, input: UpdatePostInput): Promise<PostCard> {
  return request<PostCard>(`/posts/${id}`, { method: 'PATCH', body: input });
}

export function deletePost(id: number): Promise<void> {
  return request<void>(`/posts/${id}`, { method: 'DELETE' });
}
