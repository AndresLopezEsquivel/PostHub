-- bookmarks — structurally identical to post_likes.
-- See docs/database_design.md "BOOKMARKS".
--
-- Same composite PK logic, same toggle semantics. The difference is purely
-- semantic: likes are a public signal, bookmarks are private. The Bookmarks
-- screen filters by user_id = me.

CREATE TABLE bookmarks (
  user_id    integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    integer     NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
