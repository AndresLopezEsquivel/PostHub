-- categories — a small lookup table of seeded reference data.
-- See docs/database_design.md "CATEGORIES".
--
-- Both `name` and `slug` exist deliberately: `name` is the human display label
-- ("Philosophy"), `slug` is the URL form (/explore?category=philosophy).
-- Deriving one from the other at runtime gets fragile with accents and spaces.
--
-- No created_at — this is reference data, not user content.

CREATE TABLE categories (
  id   serial      PRIMARY KEY,
  name varchar(50) NOT NULL UNIQUE,
  slug varchar(50) NOT NULL UNIQUE
);
