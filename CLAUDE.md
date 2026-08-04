# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

The design docs under `docs/` are the source of truth; a backend has landed on
top of them and was filled in one resource group at a time. All nine groups in
the controller order — **categories + `GET /api/health`**, **auth**, **posts
CRUD**, **likes + bookmarks**, **comments**, **users + follows**, **feed**,
**notifications**, and **uploads** — are now implemented and tested; the backend
API surface is complete (see "Controller implementation order" below).

A **frontend scaffold** has since landed in `frontend/` (Vite + React + TypeScript
+ React Router + plain CSS, served by Nginx in production). The shell is real —
routing, the session bootstrap, guards, nav, error boundary, and the one fetch
wrapper — but **all twelve screens are placeholders**. They land one pass at a
time, in the order under "Screen implementation order" below.

Design specs (still the authority for *what* to build):

- `docs/screens.md` — screen inventory (data shown, actions, states, access per screen) + the route table
- `docs/database_design.md` — PostgreSQL schema, derived directly from the screens
- `docs/api_design.md` — REST API, derived directly from the schema
- `docs/backend_setup.md` — how to run the backend locally via Docker Compose
- `docs/frontend_setup.md` — how to run the frontend, and the same-origin proxy contract

The three specs form a deliberate chain: **screens → schema → API**. Each layer
justifies its decisions by pointing at the layer before it ("this column exists
because this screen needs this query"). When extending any one of them, trace
the change through the other two rather than editing in isolation.

## Commits

Write commit messages in conventional commit format: `type(scope): description`.

## Backend

Lives in `backend/` (Node.js 20 + Express 5 + TypeScript). Handlers were added
**one resource group at a time** against the same mount tree, and all nine now
register real paths (with services and tests): **categories**, **auth**,
**posts**, **likes/bookmarks**, **comments**, **users/follows**, **feed**,
**notifications**, and **uploads**. The uploads endpoint is S3-dependent and stays
**dormant** (`503 { "error": { "message": "Uploads are not configured" } }`) until
its four S3 env vars are set — presigning is a local computation, so no AWS is
contacted unless configured.

Layout mirrors the spec so nothing is guessed: `src/routes/` has one
`*.routes.ts` per resource group and `src/routes/index.ts` is the single place
that maps the full mount tree against `api_design.md`. `src/{controllers,services,types}/`
now hold the categories/auth/posts/likes/bookmarks/comments/users/feed/notifications/uploads
controllers and services (plus the camelCase API-shape types each service owns; the
feed has a controller but no service of its own — its `listFeed` lives in
`posts.service` next to the other card queries; uploads has no DB layer at all — its
service signs S3 URLs). Each handler
added its files alongside the existing ones, not pre-stubbed ahead of
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
4. **Likes + Bookmarks** — ✅ **done** (4292db0). Idempotent `PUT`/`DELETE`
   toggles that retrofitted the `postCard` fields step 3 stubbed. The card
   serializer is now viewer-aware (`cardSelect(viewerParam)` computes `likeCount`
   and per-viewer `likedByMe`/`bookmarkedByMe`); `commentCount` stays stubbed for
   step 5. `GET /api/bookmarks` reuses the card renderer and pagination envelope.
5. **Comments** — ✅ **done** (8c7d8a5). Two route groups (post-scoped GET/POST,
   comment-scoped PATCH/DELETE) — flat, not threaded (`comments` has no
   `parent_comment_id`); reuses the step-3 owner guard. Completed `commentCount`
   as a live `COUNT(*)` in the shared serializer, so every `postCard` field is now
   real.
6. **Users + follows** — ✅ **done** (4823a3a). Public profile with derived
   post/follower/following `COUNT(*)`s and a viewer-relative `followedByMe`;
   `PATCH /me` partial update (rejects the immutable `username` with `400`, maps an
   email collision to `409`); user-posts + followers/following sub-lists (rows
   carry their own `followedByMe`); and the idempotent `PUT`/`DELETE` follow toggle
   (self-follow `400`) returning the new state. User posts reuse a new
   `listPostsByAuthor` in `posts.service` (mirrors `listBookmarks`); the `23505`
   predicate moved into `db/pgErrors` as `isUniqueViolation`, shared with `auth`.
7. **Feed** — ✅ **done** (2b085f1). `GET /api/feed`: `listPosts` restricted to
   followees (`WHERE p.author_id IN (SELECT followee_id FROM follows WHERE
   follower_id = $me)`), newest-first, same card renderer and envelope. `listFeed`
   reuses the card machinery a third time (after `listBookmarks`/`listPostsByAuthor`)
   with a single `$1` for both the followee subquery and the viewer state; own posts
   never appear (self-follow CHECK). Auth-only (`401` vs a `200` empty page for a
   user following no one); page/limit only, per the `api_design` contract.
8. **Notifications** — ✅ **done** (this pass). Last of the domain, because rows are
   produced as *side effects* of likes, comments, and follows (steps 4–6): each of
   those producers now wraps its state change and a conditional notification
   `INSERT` in `withTransaction` (via the shared `insertNotification(tx, …)` in
   `notifications.service`). Creation policy: **no self-notifications**;
   like/follow notify only on a genuine new relationship (`ON CONFLICT DO NOTHING
   RETURNING` → `rowCount > 0`), comments always; notifications persist through
   unlike/unfollow (CASCADE cleans on delete). The read side is the recipient-scoped
   `GET /api/notifications` (`?unread` filter + an always-live `unreadCount` badge),
   `PATCH /:id` (owner guard keyed on `recipient_id`, not `author_id`), and the
   `POST /read-all` action.
9. **Uploads** (`presign`) — ✅ **done** (this pass). Orthogonal (S3-dependent, not
   DB-dependent) and the last group — the API surface is now complete.
   `POST /api/uploads/presign` (auth) validates `purpose` (→ `posts/`|`avatars/`
   prefix) and `contentType` (image MIME allowlist → extension), mints an opaque
   `<prefix>/<uuid>.<ext>` key, and signs a direct-to-S3 `PUT` URL with the AWS SDK
   (`@aws-sdk/client-s3` + `s3-request-presigner`) — a purely local computation, so
   the endpoint builds and is fully tested offline with throwaway creds; only the
   client's later `PUT` needs a real bucket. Config lives in `env.ts` (`S3_BUCKET`,
   `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional
   `UPLOAD_URL_TTL`); when any is unset the service's config gate returns `503`
   (`serviceUnavailable`) and the feature stays dormant — `imageKey`/`avatar_key`
   are nullable, so posts and profiles work without it. It goes live the moment the
   env is set, no code change. Deferred (not code): create the bucket + an IAM
   `s3:PutObject` principal + a **bucket CORS policy allowing `PUT` from the frontend
   origin** (the usual first gotcha), then set the env vars.

### Running it

Everything runs through Docker — there is **no host Node/npm** in this
environment. From the repo root:

```
docker compose up --build          # start web (:5173) + api (:4000) + postgres (:5432)
docker compose up --build -d       # ... detached
docker compose logs -f api         # watch tsx-watch hot-reload restarts
docker compose down                # stop; add -v to also wipe the db volume

# Opt-in: the built bundle behind the real nginx.conf, on :8080
docker compose --profile prod-parity up --build -d web-prod
```

`backend/` is bind-mounted into the `api` container and runs `npm run dev`
(`tsx watch`), so editing `backend/src/**` hot-reloads without a rebuild;
`frontend/` is bind-mounted into `web` the same way, running `vite` with HMR.
Rebuild only when a `package.json` or a `Dockerfile` changes — and add
`--renew-anon-volumes`, or the stale `node_modules` volume masks the new install.
See `docs/backend_setup.md` and `docs/frontend_setup.md` for the full workflow,
env vars, and troubleshooting (e.g. regenerating `package-lock.json` without host
npm). No lint command yet — add it here when that tooling lands. That is a
repo-wide decision covering `backend/` too, deliberately not made by the frontend
scaffold.

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

## Frontend

Lives in `frontend/` (Vite + React 19 + TypeScript + React Router + plain CSS).
Currently a **scaffold**: the shell works end to end, every screen is a
placeholder. Layout mirrors the backend's so the correspondence is legible:

| Frontend | Backend twin |
| --- | --- |
| `src/routes.tsx` — the whole URL tree, in one file | `src/routes/index.ts` |
| `src/api/*.ts` — one module per resource group, each owning its types | `src/services/*.service.ts` |
| `src/pages/*.tsx` — one file per screen | `src/controllers/*.controller.ts` |
| `src/auth/` — provider + guards, cross-cutting | `src/middleware/requireAuth.ts` |
| `src/api/client.ts` — one wrapper, one `ApiError` | `src/errors/httpError.ts` + `errorHandler` |

Conventions baked into the scaffold:

- **One fetch wrapper.** Every request goes through `request<T>()` in
  `src/api/client.ts`, which is the only place `fetch` is called and the only
  place an error becomes an `ApiError` (carrying `status`, `message`, and the
  optional `field`). Components never branch on `res.ok`.
- **No base URL, ever.** The client prefixes `/api` and nothing else — Vite
  proxies it in dev, Nginx in production. A `VITE_API_URL` would make every
  request cross-origin and break the session cookie, since the backend mounts no
  CORS middleware on purpose. If anyone reaches for CORS config, the proxy is
  broken.
- **Types live next to the code that owns them**, under an `// --- API shapes ---`
  banner, transcribed from the owning backend service. There is no shared
  `types/api.ts` barrel, for the same reason the backend has none. The
  cross-process duplication is deliberate: `api_design.md` is the contract and
  both sides transcribe it.
- **Auth status is three states, not a boolean** (`'loading' | 'authenticated' |
  'anonymous'`). The guards *hold* on `'loading'` rather than redirecting —
  otherwise every authenticated user who hard-refreshes a deep link is bounced to
  `/login` and loses their destination. `GET /api/auth/session` answering `401` is
  the normal logged-out path; `api/auth.ts` is the single place that becomes
  `null`, and everything else still throws so an outage is never mistaken for a
  logout.
- **Guards are layout routes**, not per-element wrappers — one `<RequireAuth />`
  renders an `<Outlet />` for its subtree, so the rule can't drift between routes.
  Client-side guards are UX only; the API is the sole authority.
- **`routes.tsx` exports both `routes` and `router`** — the table can be driven by
  `createMemoryRouter` in a test at any path, while `router` binds real browser
  history for `main.tsx`. Same split, same reason, as `app.ts` vs `server.ts`.
- **`createBrowserRouter` for the table and `errorElement` only** — no `loader`s,
  no `action`s. Screens fetch through `src/api/*`, so there is one data story.
  Don't half-adopt the data APIs later.
- **CSS Modules + global tokens.** Three global stylesheets (`reset`, `tokens`,
  `base`) imported once in `main.tsx`; everything else is `Component.module.css`
  beside its component. Components reference `var(--color-…)` / `var(--space-…)`
  and never hardcode a colour or a spacing value.
- **Relative imports only — no path aliases.** The repo has none; adding one would
  need duplicate config across `tsconfig`, `vite.config`, and `vitest.config`.
- **No data-fetching or state library.** Screens own their loading state. The
  moment to revisit is pass 4 (optimistic like/bookmark toggles that must stay
  consistent across four screens) — with evidence, not before.

### Screen implementation order

Same discipline as the controller order: build the primitives later screens
assert against, before those screens. **Pass 0 (scaffold) is done.**

1. **Register + Login** (+ real nav auth states) — nothing gated is testable until
   a session can be created *from the UI*; the exact reason auth was backend step
   2. Establishes `ApiError.field` → form-field error mapping.
2. **Explore** — the core read path. Establishes the `PostCard` component, the
   `Paginated<T>` list machinery, filters bound to URL search params (so filter
   state is shareable), and the loading/empty/error triad every later list reuses.
   Adds `api/posts.ts`, `api/categories.ts`.
3. **Post detail + comments** — the detail fetch, the username-based ownership
   comparison, comment list/compose. Adds `api/comments.ts`.
4. **Like / bookmark toggles** — retrofits card and detail with optimistic updates
   driven by the returned `LikeState`/`BookmarkState`, deliberately *after* 2–3,
   exactly as backend step 4 retrofitted the card fields step 3 stubbed.
5. **Create / Edit / Delete post** — the first real forms: category multi-select,
   destructive-action confirmation. Image upload deferred to 9.
6. **Profile + Edit profile + follows + Followers/Following** — card list's second
   data source; the follow toggle; `PATCH /users/me` including the
   username-immutable `400`. Adds `api/users.ts`.
7. **Feed + Bookmarks** — the card list's third and fourth sources, near-free once
   2 and 4 exist. Feed's empty state is a call to action, not an absence.
8. **Notifications + nav unread badge** — last of the domain, mirroring the
   backend: it reads side effects produced by passes 4–6, and `unreadCount` rides
   in the list envelope so the badge costs no second request.
9. **Uploads** (post image + avatar) — orthogonal, S3-dependent, must degrade
   gracefully on `503`. **Blocked:** `avatarKeyToUrl()` in `posts.service.ts`
   returns `null` unconditionally and posts expose a raw `imageKey` with no base
   URL on any endpoint, so the frontend cannot render an image today. The fix is a
   *backend* pass — resolve keys from an `S3_PUBLIC_BASE_URL`, adding an
   `imageUrl` field *alongside* `imageKey` (the edit form must still resend the
   key).

### Testing

Vitest in two projects (`frontend/vitest.config.ts`), mirroring the backend split:

- **unit** — co-located `src/**/*.test.{ts,tsx}`, jsdom, `fetch` stubbed.
- **integration** — `frontend/tests/integration/**`, rendering the **real** route
  table and the real `AuthProvider` against **MSW** handlers. MSW intercepts at
  the network layer, so the real `api/client.ts` executes with its real error
  mapping — the same parity `supertest` buys the backend against `posthub_test`.
  `tests/msw/handlers.ts` grows one resource group per pass.

```
docker compose exec web npm test             # both layers
docker compose exec web npm run test:unit    # / test:integration / test:watch
docker compose exec web npm run typecheck    # tsc --noEmit; Vite owns the build
```

Same rule as the backend: don't pad with unit tests that only assert a URL string
was built — for thin pass-throughs the integration test is the one that matters.

## Architecture

**Stack implied by the docs:** PostgreSQL database, a REST backend, and a React
frontend that talks to it through a same-origin proxy (client code never
addresses the backend host/port directly — see "Base path" in `api_design.md`).
Session-based auth via cookie, with sessions persisted using `connect-pg-simple`
(a library-managed table, deliberately absent from the ERD).

That proxy now has two concrete implementations, and they are the only places the
backend's address appears: `frontend/vite.config.ts` (`server.proxy`) in dev, and
`frontend/nginx.conf` (`location /api/`) in production, where Nginx also serves
the built static bundle. **SPA history fallback is the frontend edge's job, not
the API's** — the backend JSON-404s every non-`/api` path by design, so
`try_files $uri $uri/ /index.html` in `nginx.conf` is what makes a hard refresh on
a deep link work. Note also that `app.ts` sets `trust proxy: 1` under
`NODE_ENV=production`, which is why `nginx.conf` must forward the
`X-Forwarded-*` headers: without them Express can't derive `req.secure`, and
`express-session` silently never emits the `secure` cookie.

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
