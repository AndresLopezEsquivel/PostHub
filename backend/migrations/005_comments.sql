-- comments — a second true relation between users and posts, carrying content.
-- See docs/database_design.md "COMMENTS".
--
-- Structurally this looks like a join table (two FKs) but it is NOT one. It
-- carries its own content and allows repeats — the same user can comment twice
-- on one post — so (post_id, author_id) is not unique and a surrogate key is
-- required.
--
-- No parent_comment_id: threading is out of scope. Adding it later is a
-- self-referential FK.

CREATE TABLE comments (
  id         serial      PRIMARY KEY,
  post_id    integer     NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
