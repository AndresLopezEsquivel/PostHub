-- post_id and comment_id are nullable because each type uses a different set:
-- a like has a post, a comment has both, and a follow has neither. One table
-- per type would be stricter, but the notifications list would need a query
-- per table.
--
-- Both cascade: a notification about a deleted post or comment has nothing left
-- to link to.

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
