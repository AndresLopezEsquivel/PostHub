-- The same shape as post_likes, but private: a post's like count is public,
-- while bookmarks are only ever read for their owner.

CREATE TABLE bookmarks (
  user_id    integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    integer     NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
