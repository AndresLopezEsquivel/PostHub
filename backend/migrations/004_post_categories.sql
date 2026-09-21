-- post_categories — the join table making categories many-to-many.
-- See docs/database_design.md "POST_CATEGORIES".
--
-- The composite PK is doing real work: it blocks tagging a post "Philosophy"
-- twice, the pair *is* the identity so no surrogate id is needed, and it
-- provides a free index on the leading column (post_id).

CREATE TABLE post_categories (
  post_id     integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);
