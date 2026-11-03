-- A composite primary key's index serves lookups by its leading column only.
-- post_likes and bookmarks lead with user_id, so lookups by post_id need their
-- own index: per-post like counts, and the cascade when a post is deleted.

CREATE INDEX posts_author_id_idx      ON posts (author_id);
CREATE INDEX posts_created_at_idx     ON posts (created_at DESC);
CREATE INDEX comments_post_id_idx     ON comments (post_id);
CREATE INDEX follows_follower_id_idx  ON follows (follower_id);
CREATE INDEX post_likes_post_id_idx   ON post_likes (post_id);
CREATE INDEX bookmarks_post_id_idx    ON bookmarks (post_id);

-- The notifications list is always scoped to one recipient, newest first.
CREATE INDEX notifications_recipient_idx
  ON notifications (recipient_id, created_at DESC);

-- The primary key covers post_categories lookups by post_id. Filtering posts by
-- category (/?category=philosophy) goes the other way, by category_id.
CREATE INDEX post_categories_category_id_idx ON post_categories (category_id);
