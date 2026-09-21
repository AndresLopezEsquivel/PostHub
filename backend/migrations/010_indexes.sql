-- Indexes. See docs/database_design.md "Constraints and indexes".
--
-- A composite PK already indexes its LEADING column, so post_likes(user_id, …)
-- and bookmarks(user_id, …) are covered by their PKs. The trailing column is
-- not — hence the explicit post_id indexes below, which is what per-post like
-- and bookmark counts scan.

CREATE INDEX posts_author_id_idx      ON posts (author_id);
CREATE INDEX posts_created_at_idx     ON posts (created_at DESC);
CREATE INDEX comments_post_id_idx     ON comments (post_id);
CREATE INDEX follows_follower_id_idx  ON follows (follower_id);
CREATE INDEX post_likes_post_id_idx   ON post_likes (post_id);

-- Not in the design doc's table, but the same reasoning applies: the Bookmarks
-- screen filters by user_id (covered by the PK), while a post's bookmark count
-- filters by post_id (not covered).
CREATE INDEX bookmarks_post_id_idx    ON bookmarks (post_id);

-- The notifications list is always scoped to one recipient, newest first.
CREATE INDEX notifications_recipient_idx
  ON notifications (recipient_id, created_at DESC);

-- post_categories(post_id) is covered by the PK's leading column; the reverse
-- direction (/explore?category=philosophy) filters on category_id, which is not.
CREATE INDEX post_categories_category_id_idx ON post_categories (category_id);
