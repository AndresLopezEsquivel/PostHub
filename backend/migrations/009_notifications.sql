-- notifications — the loosest table, by necessity.
-- See docs/database_design.md "NOTIFICATIONS".
--
-- Self-referential through users twice: recipient_id (who sees it) and
-- actor_id (who caused it).
--
-- Why post_id and comment_id are nullable: a follow notification has neither,
-- a like has a post but no comment. The target columns are conditionally
-- relevant, so the table cannot be fully constrained. This is a known
-- polymorphic-style trade-off — the alternative (one table per type) is
-- stricter but multiplies queries for a single unified list.
--
-- Both target FKs cascade: a notification about a deleted post has nothing
-- left to link to.

CREATE TABLE notifications (
  id           serial      PRIMARY KEY,
  recipient_id integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id     integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         varchar(20) NOT NULL,
  post_id      integer     REFERENCES posts(id) ON DELETE CASCADE,
  comment_id   integer     REFERENCES comments(id) ON DELETE CASCADE,
  is_read      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_valid
    CHECK (type IN ('like', 'comment', 'follow'))
);
