-- posts — the core content table.
-- See docs/database_design.md "POSTS".
--
-- The FK lives on the many side, as it always does. `author_id NOT NULL`
-- enforces "one post has exactly one author"; ON DELETE CASCADE means deleting
-- a user removes their posts.
--
-- No `status` column — drafts are out of scope, which keeps every posts query
-- free of a status filter.

CREATE TABLE posts (
  id         serial       PRIMARY KEY,
  author_id  integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      varchar(200) NOT NULL,
  content    text         NOT NULL,
  image_key  varchar(255),
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz
);
