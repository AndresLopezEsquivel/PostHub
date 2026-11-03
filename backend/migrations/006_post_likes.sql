-- The composite primary key allows one like per user per post, enforced by the
-- database instead of app code. Each row is a like: unliking deletes it, the
-- like count is COUNT(*) by post_id, and "did I like it?" is a primary key
-- lookup on (user_id, post_id).
--
-- A like counter on posts could not answer "did I like it?", which is why likes
-- are stored as rows.

CREATE TABLE post_likes (
  user_id    integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    integer     NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
