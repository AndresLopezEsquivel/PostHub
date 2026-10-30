-- Following is one-way, so a mutual follow is two rows.
--
-- follower_id is the user who follows, and followee_id is the user being
-- followed. The names are one letter apart, and swapping them in a query
-- silently inverts the feed.
--
-- The CHECK blocks self-follows in the database, so no code path, seed scripts
-- included, can create one.

CREATE TABLE follows (
  follower_id integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> followee_id)
);
