-- follows — the self-referential table.
-- See docs/database_design.md "FOLLOWS".
--
-- Both FKs target users. Following is directional and asymmetric: A→B does not
-- imply B→A, and a mutual follow is two rows.
--   follower count  = COUNT(*) WHERE followee_id = X
--   following count = COUNT(*) WHERE follower_id = X
--
-- NAMING CAUTION: follower_id (doing the following) and followee_id (being
-- followed) are one letter apart. A swap silently inverts the entire feed.
-- The -er/-ee pair is fixed across schema, services, and API responses.
--
-- The CHECK blocks self-follow at the database level, so no application code
-- path — controller, service, or seed script — can create such a row.

CREATE TABLE follows (
  follower_id integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> followee_id)
);
