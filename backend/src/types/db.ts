// Row types — one interface per table, mirroring the columns in
// docs/database_design.md exactly.
//
// These are snake_case ON PURPOSE. They describe what a `SELECT *` hands back,
// nothing more. The camelCase, computed API shapes (<postCard> with likeCount,
// likedByMe, excerpt) are NOT here: those fields come from joins and COUNT
// aggregates that no single row produces, so building them belongs to the
// service that writes that query — not to this layer, which returns what the
// database returns.
//
// `| null` marks the nullable columns from the schema. `serial`/`integer` map
// to number, `varchar`/`text` to string, `timestamptz` to string (pg returns
// it as an ISO string by default).

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
