# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

The design docs under `docs/` are the source of truth; a backend scaffold has
now landed on top of them. Everything is early — no route handlers, no DB
queries, no auth yet.

Design specs (still the authority for *what* to build):

- `docs/screens.md` — screen inventory (data shown, actions, states, access per screen)
- `docs/database_design.md` — PostgreSQL schema, derived directly from the screens
- `docs/api_design.md` — REST API, derived directly from the schema
- `docs/backend_setup.md` — how to run the backend locally via Docker Compose

The three specs form a deliberate chain: **screens → schema → API**. Each layer
justifies its decisions by pointing at the layer before it ("this column exists
because this screen needs this query"). When extending any one of them, trace
the change through the other two rather than editing in isolation.

## Backend

Lives in `backend/` (Node.js 20 + Express 5 + TypeScript). It is a **structural
scaffold only**: every API resource group from `api_design.md` has an empty
router that is mounted but registers zero paths, so *every* request currently
returns `404 { "error": { "message": "Not found" } }`. That's expected — the
next passes add real handlers to already-mounted files, one resource at a time.

Layout mirrors the spec so nothing is guessed: `src/routes/` has one
`*.routes.ts` per resource group and `src/routes/index.ts` is the single place
that maps the full mount tree against `api_design.md`. `src/{controllers,services,types}/`
are placeholder dirs (README only) — populated alongside the first handler that
needs them, not pre-stubbed. `src/app.ts` (importable app) and `src/server.ts`
(binds the port) are split so the app can be tested without listening.

Conventions baked into the scaffold:
- **Nested routers use `Router({ mergeParams: true })`** (likes, post-scoped
  comments/bookmarks) so a future handler can read `req.params.postId`.
- **More-specific mounts before general ones** in `routes/index.ts`
  (`/posts/:postId/comments` before `/posts`).
- **Shared error envelope `{ error: { message } }`** — the only two middleware
  with logic (`notFoundHandler`, `errorHandler`) reuse it; per-error status
  codes and a `field` key are deferred to the handlers that produce them.

### Running it

Everything runs through Docker — there is **no host Node/npm** in this
environment. From the repo root:

```
docker compose up --build          # start api (:4000) + postgres (:5432)
docker compose up --build -d       # ... detached
docker compose logs -f api         # watch tsx-watch hot-reload restarts
docker compose down                # stop; add -v to also wipe the db volume
```

`backend/` is bind-mounted into the `api` container and runs `npm run dev`
(`tsx watch`), so editing `backend/src/**` hot-reloads without a rebuild.
Rebuild only when `package.json` or the `Dockerfile` changes. See
`docs/backend_setup.md` for the full workflow, env vars, and troubleshooting
(e.g. regenerating `package-lock.json` without host npm). There are no lint or
test commands yet — add them here when that tooling lands.

**Local dev credentials are intentionally throwaway and committed.** The
`posthub`/`posthub` Postgres user/password/db in `docker-compose.yml` are
hardcoded on purpose: they unlock only a disposable local database, so a new
contributor gets a working stack with zero setup. This is fine *only* because
nothing real is behind them.

> **When deployment gets real:** do not carry this pattern forward. The moment
> the stack points at a database with real data or runs in a deployed
> environment, move credentials out of the committed `docker-compose.yml` into a
> git-ignored root `.env` (Compose auto-loads it) referenced via
> `${POSTGRES_PASSWORD:-posthub}`-style substitution, with a committed
> `.env.example` documenting the keys. Never commit a real password — git
> history is forever. Note this root Compose `.env` is a *different* scope from
> `backend/.env` (which `dotenv` loads inside the Node process); don't conflate
> the two.

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
