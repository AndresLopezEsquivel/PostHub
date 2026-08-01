# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

The design docs under `docs/` are the source of truth; a backend has landed on
top of them and is being filled in one resource group at a time. The database
layer plus the first three groups in the controller order — **categories +
`GET /api/health`**, **auth**, and **posts CRUD** — are implemented and tested;
the remaining resource groups are still empty mounted routers (see "Controller
implementation order" below).

Design specs (still the authority for *what* to build):

- `docs/screens.md` — screen inventory (data shown, actions, states, access per screen)
- `docs/database_design.md` — PostgreSQL schema, derived directly from the screens
- `docs/api_design.md` — REST API, derived directly from the schema
- `docs/backend_setup.md` — how to run the backend locally via Docker Compose

The three specs form a deliberate chain: **screens → schema → API**. Each layer
justifies its decisions by pointing at the layer before it ("this column exists
because this screen needs this query"). When extending any one of them, trace
the change through the other two rather than editing in isolation.

## Commits

Write commit messages in conventional commit format: `type(scope): description`.

## Backend

Lives in `backend/` (Node.js 20 + Express 5 + TypeScript). Handlers are being
added **one resource group at a time** against the same mount tree: the
**categories**, **auth**, and **posts** routers now register real paths (with
services and tests), while every still-empty router (likes/bookmarks, comments,
users/follows, feed, notifications, uploads) is mounted but registers zero
paths, so requests to those groups return `404 { "error": { "message": "Not
found" } }`. That's expected — the next passes fill in the already-mounted files.

Layout mirrors the spec so nothing is guessed: `src/routes/` has one
`*.routes.ts` per resource group and `src/routes/index.ts` is the single place
that maps the full mount tree against `api_design.md`. `src/{controllers,services,types}/`
now hold the categories/auth/posts controllers and services (plus the camelCase
API-shape types each service owns); they're still populated pass by pass — a new
handler adds its files alongside the existing ones, not pre-stubbed ahead of
need. `src/app.ts` (importable app) and `src/server.ts` (binds the port) are
split so the app can be tested without listening.

Conventions baked into the scaffold:
- **Nested routers use `Router({ mergeParams: true })`** (likes, post-scoped
  comments/bookmarks) so a future handler can read `req.params.postId`.
- **More-specific mounts before general ones** in `routes/index.ts`
  (`/posts/:postId/comments` before `/posts`).
- **Shared error envelope `{ error: { message } }`** — the only two middleware
  with logic (`notFoundHandler`, `errorHandler`) reuse it; per-error status
  codes and a `field` key are deferred to the handlers that produce them.

### Database layer

The schema lives in `backend/migrations/*.sql` (plain SQL, transcribed from
`docs/database_design.md`) and is applied by a small forward-only runner
(`src/db/migrate.ts`, `npm run migrate`) that records applied files in a
`schema_migrations` ledger. `src/db/` holds the query layer; no controllers or
services exist yet. Conventions to preserve:

- **Migrations are additive-only.** A schema change is a *new* numbered file,
  never an edit to one already applied — the runner skips anything in the ledger,
  so editing an applied file is a silent no-op on existing databases. There are
  no `down` scripts; start clean with `docker compose down -v`.
- **`migrate` is a deploy step, not a boot step.** `server.ts` must never call
  it. It takes a `pg_advisory_lock` (safe under concurrent deploys) and honours
  `DATABASE_SSL=true` for RDS. The production image ships the `.sql` files
  alongside `dist/`.
- **Parameterized queries only.** Use the helpers in `src/db/query.ts`
  (`query` / `queryOne` / `queryMany`) with `$1, $2` placeholders — never
  interpolate values into SQL. Multi-statement operations (create post + attach
  categories, insert like + notification) go through `withTransaction`, which
  BEGIN/COMMIT/ROLLBACKs and releases the client on every path.
- **`COUNT(*)` returns a JS `number`, not a string** — because `src/db/types.ts`
  registers a pg parser for `int8` (OID 20). That module is imported for its side
  effect by `pool.ts` before any query runs; keep it that way, since the schema
  derives every count (`likeCount`, `commentCount`, pagination `total`) from
  aggregates.
- **Row types (`src/types/db.ts`) are snake_case**, one interface per table,
  mirroring the columns. They describe what `SELECT *` returns — *not* the
  camelCase API shapes (`<postCard>` with `likedByMe`, `excerpt`), which are
  built by the service that owns the query, not this layer.

`npm run seed` inserts category reference data (idempotent, production-safe);
`npm run seed:dev` wipes the domain tables and inserts sample content (refuses to
run under `NODE_ENV=production`). See `docs/backend_setup.md` for the workflow.

### Controller implementation order

Controllers are added **incrementally, one resource group per pass** — not all at
once. The order below is deliberate: build the primitives that other handlers
assert against before the handlers that assert against them. The spine is 1→2→3;
everything from 4 on hangs off the `<postCard>` shape and the ownership pattern
those establish.

1. **Categories** (+ `GET /api/health`) — ✅ **done** (c19bc63). The walking
   skeleton. Read-only, no auth, no ownership, no pagination: proves the DB →
   service → controller → router → error-envelope pipeline end to end before any
   hard semantics. `health` just wraps the existing `checkDatabase()`;
   `createPost` needs category ids anyway.
2. **Auth** (register / login / logout / session) — ✅ **done** (578acef). The
   real foundation. Builds password verification, the `connect-pg-simple` session
   store, and the **`requireAuth` middleware** every later `auth` endpoint
   imports. Nothing gated is testable until this lands.
3. **Posts** (CRUD) — ✅ **done** (ebc409a). The core noun. Establishes the
   `<postCard>` shape, the pagination envelope, and the **ownership → `403`**
   pattern every later write reuses. `likeCount`/`commentCount`/`likedByMe`/
   `bookmarkedByMe` are stubbed at their empty values in the card serializer;
   step 4 fills them in.
4. **Likes + Bookmarks** — ⏭️ **next**. Idempotent `PUT`/`DELETE` toggles that
   retrofit the `postCard` fields step 3 stubbed. Small, and best done while the
   card code is fresh.
5. **Comments** — nested + top-level; completes `commentCount` and reuses the
   step-3 owner guard.
6. **Users + follows** — profiles with derived counts, and the follow toggle.
   Follows are the prerequisite for the feed.
7. **Feed** — trivial once follows exist: `listPosts` restricted to followees,
   same card renderer and envelope.
8. **Notifications** — last of the domain, because rows are produced as *side
   effects* of likes, comments, and follows (steps 4–6). Wiring the inserts into
   those handlers requires them to already exist.
9. **Uploads** (`presign`) — orthogonal (S3-dependent, not DB-dependent).
   `imageKey`/`avatar_key` are nullable, so posts and profiles work without it;
   land it whenever AWS credentials are ready.

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
(e.g. regenerating `package-lock.json` without host npm). No lint command yet —
add it here when that tooling lands.

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

### Testing

Vitest, in two projects (config in `backend/vitest.config.ts`), added ahead of
the controllers so each pass in the order above lands with its tests:

- **unit** — co-located `src/**/*.test.ts`, no database. Mock the `src/db/query`
  helpers (or spy on `pool`) and assert pure logic and row → API-shape mapping.
  Fast; runs in parallel.
- **integration** — `backend/tests/integration/**`, the real `app` (from
  `src/app.ts`, which is why it's split from `server.ts`) driven with `supertest`
  against a dedicated **`posthub_test`** database. `tests/setup.ts` truncates the
  domain tables before each test; files run serially (one shared database).

```
docker compose exec api npm run test:setup   # once: create + migrate posthub_test
docker compose exec api npm test             # both layers
docker compose exec api npm run test:unit    # / test:integration / test:watch
```

Conventions to preserve:
- **Unit-first, then integration, per pass.** Write unit tests for the
  logic-bearing parts (mapping, pagination, ownership, validation), then prove the
  endpoint end to end with an integration test for each documented status code.
  For thin pass-throughs the integration test is the one that matters — don't pad
  with unit tests that only assert "the right SQL string was passed."
- **Tests never touch the dev database.** The `test` scripts pin `DATABASE_URL`
  to `posthub_test` and `tests/setup.ts` refuses any database not ending in
  `_test`. Keep both guards.
- **`migrate.ts` exports `runMigrations(pool?)`** so the harness can migrate
  `posthub_test`; its CLI path is guarded by `require.main === module`. Don't
  reintroduce top-level migration calls — importing the module must stay
  side-effect-free.
- **Co-located `*.test.ts` are excluded from `tsc`** (`tsconfig.json`) so they
  never compile into `dist/`.

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
