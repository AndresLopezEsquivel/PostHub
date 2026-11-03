-- No `status` column: drafts are out of scope, so no posts query needs a
-- status filter.

CREATE TABLE posts (
  id         serial       PRIMARY KEY,
  author_id  integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      varchar(200) NOT NULL,
  content    text         NOT NULL,
  image_key  varchar(255),
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz
);
