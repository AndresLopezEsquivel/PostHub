-- No `role` column: authorization is ownership-based, so users can change only
-- what they created. Roles can be added later with an ALTER TABLE.
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
