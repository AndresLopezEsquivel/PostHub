// Row types, one interface per table, mirroring the columns the migrations
// create (the diagram is in docs/database.md).
//
// These are snake_case on purpose: they describe what a `SELECT *` returns.
// The camelCase API shapes (such as a post card with likeCount, likedByMe and
// excerpt) are not here, because those fields come from joins and COUNT
// aggregates that no single row produces. The service that writes the query
// builds them.

export interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  bio: string | null;
  avatar_key: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PostRow {
  id: number;
  author_id: number;
  title: string;
  content: string;
  image_key: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CategoryRow {
  id: number;
  name: string;
  slug: string;
}

export interface PostCategoryRow {
  post_id: number;
  category_id: number;
}

export interface CommentRow {
  id: number;
  post_id: number;
  author_id: number;
  content: string;
  created_at: string;
  updated_at: string | null;
}

export interface PostLikeRow {
  user_id: number;
  post_id: number;
  created_at: string;
}

export interface BookmarkRow {
  user_id: number;
  post_id: number;
  created_at: string;
}

export interface FollowRow {
  follower_id: number;
  followee_id: number;
  created_at: string;
}

export type NotificationType = 'like' | 'comment' | 'follow';

export interface NotificationRow {
  id: number;
  recipient_id: number;
  actor_id: number;
  type: NotificationType;
  post_id: number | null;
  comment_id: number | null;
  is_read: boolean;
  created_at: string;
}
