-- session — the express-session store, managed by connect-pg-simple.
--
-- Deliberately absent from the ERD in docs/database_design.md: it is a
-- library-owned table, not part of the domain model. It lives here as a
-- migration (rather than being auto-created by the store at boot) so that
-- schema creation stays a deploy step — `npm run migrate` / `npm run test:setup`
-- provision it exactly like every other table, and the app is constructed with
-- `createTableIfMissing: false`. server.ts never mutates schema on start.
--
-- Columns and names are fixed by connect-pg-simple's own queries — this is its
-- canonical table (see node_modules/connect-pg-simple/table.sql), transcribed
-- verbatim minus the obsolete WITH (OIDS=FALSE) clause. Do not rename columns.
--   sid    — the session id (cookie value), primary key.
--   sess   — the serialized session payload (we store just { userId }).
--   expire — when the row may be reaped; the library sweeps on this column.

CREATE TABLE "session" (
  "sid"    varchar      NOT NULL COLLATE "default",
  "sess"   json         NOT NULL,
  "expire" timestamp(6) NOT NULL
);

ALTER TABLE "session"
  ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");
