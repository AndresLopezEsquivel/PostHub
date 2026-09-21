-- post_likes — see docs/database_design.md "POST_LIKES".
--
-- The composite PK enforces one like per user per post at the database level,
-- not in app code. Consequences worth naming:
--   * "unlike" is just a DELETE — the row's existence *is* the like
--   * like count       = COUNT(*) WHERE post_id = X
--   * "did I like it?" = does row (me, X) exist — a PK lookup, fast
--
-- That last query is precisely why this cannot be a counter column on posts.

CREATE TABLE post_likes (
  user_id    integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    integer     NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
