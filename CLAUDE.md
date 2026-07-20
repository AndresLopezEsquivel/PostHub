# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

PostHub is currently **design-only** — the repo contains no source code, no
package manifest, and no build/test tooling. Everything that exists lives under
`docs/` as three specs:

- `docs/screens.md` — screen inventory (data shown, actions, states, access per screen)
- `docs/database_design.md` — PostgreSQL schema, derived directly from the screens
- `docs/api_design.md` — REST API, derived directly from the schema

There are no commands to build, lint, or test yet. When implementation begins,
update this file with the actual commands (package manager, test runner, dev
server) rather than guessing at conventions that don't exist yet.

The three docs form a deliberate chain: **screens → schema → API**. Each layer
justifies its decisions by pointing at the layer before it ("this column exists
because this screen needs this query"). When extending any one of them, trace
the change through the other two rather than editing in isolation.

## Architecture

**Stack implied by the docs:** PostgreSQL database, a REST backend, and a React
frontend that talks to it through a same-origin proxy (client code never
addresses the backend host/port directly — see "Base path" in `api_design.md`).
Session-based auth via cookie, with sessions persisted using `connect-pg-simple`
(a library-managed table, deliberately absent from the ERD).

**Domain model** (`docs/database_design.md`): `users`, `posts`, `comments` are
the core content tables. `post_likes`, `bookmarks`, `follows`, `post_categories`
are join tables with **composite primary keys** (no surrogate `id`) — the pair
itself is the identity, which is what makes "did I like this?" a fast PK lookup
rather than a scan. `comments` looks like a join table (two FKs: `post_id`,
`author_id`) but isn't — it carries content and allows repeats, so it needs its
own surrogate key. `follows` and `notifications` are self-referential on
`users`.

Key conventions worth preserving when touching the schema or API:
- **No `role` column, no roles.** Authorization is purely ownership-based:
  a write succeeds if `author_id` (or equivalent) matches the session user,
  otherwise `403`. Don't introduce role checks without a real requirement —
  the model is designed so roles would be a purely additive migration later.
- **Counts are derived (`COUNT(*)`), never denormalized counters.** Resist
  adding `like_count`/`comment_count` columns; correctness before performance.
- **Follow direction:** `follower_id` / `followee_id` (the `-er`/`-ee` pair),
  never `following_id`. The two names are one letter apart and a swap silently
  inverts the feed — treat this naming as fixed across schema, services, and
  API responses.
- **Usernames are immutable** and are the identifier for user-facing routes
  (`/api/users/:username`); every other resource (`posts`, `comments`,
  `notifications`) is addressed by numeric `id`. `PATCH /api/users/me` must
  reject a `username` field in the body with `400` rather than silently
  dropping it.
- **Toggle relationships (likes, bookmarks, follows) use `PUT`/`DELETE`, not
  `POST`,** and are idempotent — liking twice or unfollowing twice is not an
  error. Toggle endpoints return the new state (e.g. `likeCount`,
  `likedByMe`) instead of `204`, so the client updates in place with no
  refetch.
- **`PATCH` is partial update everywhere**; there is no `PUT` for
  posts/comments/profiles, since full-replacement semantics would force the
  client to resend unchanged fields.
- **Uploads are presigned, direct-to-S3.** `POST /api/uploads/presign` returns
  a presigned URL and object key; the client `PUT`s bytes straight to S3 and
  only ever sends the resulting `key` (`imageKey`/`avatar_key`) to the backend.
  Image bytes never transit the API server.
- **`401` vs `403` is kept honest**: `401` = no valid session, `403` =
  authenticated but not the owner. `getSession` returns `401` (not
  `200 {user: null}`) so the client's "am I logged in" check and its error
  handling share one code path.

See the "Design decisions" sections at the bottom of `database_design.md` and
`api_design.md` for the reasoning behind these choices before changing them.
