-- The express-session store's table, owned by connect-pg-simple. A migration
-- creates it, instead of the store at startup, so schema changes stay a deploy
-- step: config/session.ts sets createTableIfMissing: false.
--
-- connect-pg-simple's queries use these exact names, so do not rename them. The
-- SQL is the library's table.sql, minus WITH (OIDS=FALSE), which is obsolete
-- since PostgreSQL 12.

CREATE TABLE "session" (
  "sid"    varchar      NOT NULL COLLATE "default",
  "sess"   json         NOT NULL,
  "expire" timestamp(6) NOT NULL
);

ALTER TABLE "session"
  ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");
