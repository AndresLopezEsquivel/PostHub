-- Both `name` and `slug` are stored: `name` is the display label ("Philosophy")
-- and `slug` is the URL form (/?category=philosophy). Deriving one from the
-- other at runtime breaks on accents and spaces.
--
-- No created_at: this is seeded reference data, not user content.

CREATE TABLE categories (
  id   serial      PRIMARY KEY,
  name varchar(50) NOT NULL UNIQUE,
  slug varchar(50) NOT NULL UNIQUE
);
