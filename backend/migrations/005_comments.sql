-- Not a join table, despite the two foreign keys: a user can comment on the
-- same post more than once, so (post_id, author_id) is not unique and each
-- comment needs its own `id`.
--
-- No parent_comment_id: threading is out of scope. It can be added later as a
-- foreign key to comments(id).

CREATE TABLE comments (
  id         serial      PRIMARY KEY,
  post_id    integer     NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
