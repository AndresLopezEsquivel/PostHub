-- users — the identity table. Everything else points back to it.
-- See docs/database_design.md "USERS".
--
-- No `role` column: authorization is ownership-based. Adding roles later is a
-- purely additive ALTER TABLE, so nothing here needs to anticipate it.
--
-- `updated_at` is nullable with no default. A fresh row has never been edited,
-- and DEFAULT now() would make every one of them look edited.

CREATE TABLE users (
  id            serial      PRIMARY KEY,
  username      varchar(30) NOT NULL UNIQUE,
  email         varchar(255) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  bio           text,
  avatar_key    varchar(255),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);
