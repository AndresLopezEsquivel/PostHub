-- The composite primary key does three jobs: it stops a post from getting the
-- same category twice, it makes a separate `id` column unnecessary, and its
-- index also serves lookups by post_id, its leading column.

CREATE TABLE post_categories (
  post_id     integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);
