# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

PostHub is complete. The backend exposes all nine resource groups (categories and
`GET /api/health`, auth, posts, likes and bookmarks, comments, users and follows,
feed, notifications, uploads), the frontend implements every screen, and the AWS
infrastructure both run on is Terraform in `infra/`.

Documentation lives in three places, none of which duplicates the others:

- `README.md` explains the architecture and holds the development and production
  runbooks plus the testing commands.
- `infra/README.md` explains the Terraform configuration file by file.
- `docs/docker.md` explains the Dockerfiles and the two Compose files;
  `docs/database.md` holds the entity-relationship diagram.

## Commits

Write commit messages in conventional commit format: `type(scope): description`.

Do not use em dashes in commit messages, comments, or documentation.

## Backend

Lives in `backend/` (Node.js 20 + Express 5 + TypeScript). The uploads endpoint is
S3-dependent and stays **dormant** (`503 { "error": { "message": "Uploads are not
configured" } }`) until its S3 env vars are set. Presigning is a local computation,
so no AWS is contacted unless configured.

Layout: `src/routes/` has one `*.routes.ts` per resource group and
`src/routes/index.ts` is the single place that maps the full mount tree.
`src/{controllers,services,types}/` hold the per-group controllers and services
plus the camelCase API-shape types each service owns. Two exceptions worth knowing:
the feed has a controller but no service of its own, since `listFeed` lives in
`posts.service` next to the other card queries, and uploads has no DB layer at all,
because its service only signs S3 URLs. `src/app.ts` (importable app) and
`src/server.ts` (binds the port) are split so the app can be tested without listening.

Conventions to preserve:

- **Nested routers use `Router({ mergeParams: true })`** (likes, post-scoped
  comments and bookmarks) so a handler can read `req.params.postId`.
- **More-specific mounts before general ones** in `routes/index.ts`
  (`/posts/:postId/comments` before `/posts`).
- **Shared error envelope `{ error: { message } }`.** The only two middleware with
  logic (`notFoundHandler`, `errorHandler`) reuse it; per-error status codes and a
  `field` key belong to the handlers that produce them.

### Database layer

The schema lives in `backend/migrations/*.sql` (plain SQL) and is applied by a
forward-only runner (`src/db/migrate.ts`, `npm run migrate`) that records applied
files in a `schema_migrations` ledger. `src/db/` holds the query layer every service
goes through.

- **Migrations are additive-only.** A schema change is a *new* numbered file, never
  an edit to one already applied: the runner skips anything in the ledger, so editing
  an applied file is a silent no-op on existing databases. There are no `down`
  scripts; start clean with `docker compose down -v`.
- **`migrate` is a deploy step, not a boot step.** `server.ts` must never call it. It
  takes a `pg_advisory_lock` (safe under concurrent deploys) and honours
  `DATABASE_SSL=true` for RDS. The production image ships the `.sql` files alongside
  `dist/`.
- **Parameterized queries only.** Use the helpers in `src/db/query.ts` (`query`,
  `queryOne`, `queryMany`) with `$1, $2` placeholders; never interpolate values into
  SQL. Multi-statement operations (create post and attach categories, insert like and
  notification) go through `withTransaction`, which BEGIN/COMMIT/ROLLBACKs and
  releases the client on every path.
- **`COUNT(*)` returns a JS `number`, not a string**, because `src/db/types.ts`
  registers a pg parser for `int8` (OID 20). That module is imported for its side
  effect by `pool.ts` before any query runs. Keep it that way, since the schema
  derives every count (`likeCount`, `commentCount`, pagination `total`) from
  aggregates.
- **Row types (`src/types/db.ts`) are snake_case**, one interface per table. They
  describe what `SELECT *` returns, *not* the camelCase API shapes (`<postCard>` with
  `likedByMe`, `excerpt`), which are built by the service that owns the query.

`npm run seed` inserts category reference data (idempotent, production-safe);
`npm run seed:dev` wipes the domain tables and inserts sample content, and refuses to
run under `NODE_ENV=production`.

### Running it

Everything runs through Docker. There is **no host Node or npm** in this environment.

```
docker compose up --build          # web :5173, api :4000, postgres :5432
docker compose up --build -d       # detached
docker compose logs -f api         # watch tsx-watch hot-reload restarts
docker compose down                # stop; add -v to also wipe the db volume
```

`docker-compose.yml` is **dev-only** and self-contained; production is a **separate,
standalone** `docker-compose.prod.yml` (not an override layered on the dev file, since
the two environments share too little), run with
`docker compose -f docker-compose.prod.yml up -d --build` against a managed RDS
database. The production runbook is in `README.md`.

`backend/` is bind-mounted into the `api` container and runs `npm run dev`
(`tsx watch`), so editing `backend/src/**` hot-reloads without a rebuild; `frontend/`
is bind-mounted into `web` the same way, running `vite` with HMR. Rebuild only when a
`package.json` or a `Dockerfile` changes, and add `--renew-anon-volumes`, or the stale
`node_modules` volume masks the new install.

No lint command yet. Add it here when that tooling lands. That is a repo-wide
decision covering `backend/` and `frontend/` alike.

**Local dev credentials are intentionally throwaway and committed.** The
`posthub`/`posthub` Postgres user, password, and database in `docker-compose.yml` are
hardcoded on purpose: they unlock only a disposable local database, so a new
contributor gets a working stack with zero setup. This is fine *only* because nothing
real is behind them.

> **For deployed environments this has already been done, and must stay that way.**
> `docker-compose.yml` reads `${POSTGRES_PASSWORD:-posthub}`-style substitutions, the
> root `.env` holding the real values is git-ignored (Compose auto-loads it), and a
> committed `.env.example` documents every key. Never commit a real password, because
> git history is forever. This root Compose `.env` is a *different* scope from
> `backend/.env` (which `dotenv` loads inside the Node process); don't conflate the
> two. Secrets AWS itself needs, such as the RDS master password, are handled in
> `infra/`.

### Testing

Vitest, in two projects (config in `backend/vitest.config.ts`):

- **unit**: co-located `src/**/*.test.ts`, no database. Mock the `src/db/query`
  helpers (or spy on `pool`) and assert pure logic and row to API-shape mapping.
  Runs in parallel.
- **integration**: `backend/tests/integration/**`, the real `app` (from `src/app.ts`,
  which is why it is split from `server.ts`) driven with `supertest` against a
  dedicated **`posthub_test`** database. `tests/setup.ts` truncates the domain tables
  before each test; files run serially, since they share one database.

```
docker compose exec api npm run test:setup   # once: create + migrate posthub_test
docker compose exec api npm test             # both projects
docker compose exec api npm run test:unit    # / test:integration / test:watch
```

Conventions to preserve:

- **Unit-first, then integration, per change.** Write unit tests for the
  logic-bearing parts (mapping, pagination, ownership, validation), then prove the
  endpoint end to end with an integration test for each documented status code. For
  thin pass-throughs the integration test is the one that matters; don't pad with
  unit tests that only assert "the right SQL string was passed."
- **Tests never touch the dev database.** The `test` scripts pin `DATABASE_URL` to
  `posthub_test` and `tests/setup.ts` refuses any database not ending in `_test`.
  Keep both guards.
- **`migrate.ts` exports `runMigrations(pool?)`** so the harness can migrate
  `posthub_test`; its CLI path is guarded by `require.main === module`. Importing the
  module must stay side-effect-free.
- **Co-located `*.test.ts` are excluded from `tsc`** (`tsconfig.json`) so they never
  compile into `dist/`.

## Frontend

Lives in `frontend/` (Vite + React 19 + TypeScript + React Router + plain CSS). The
layout mirrors the backend's so the correspondence is legible:

| Frontend | Backend twin |
| --- | --- |
| `src/routes.tsx` (the whole URL tree, in one file) | `src/routes/index.ts` |
| `src/api/*.ts` (one module per resource group, each owning its types) | `src/services/*.service.ts` |
| `src/pages/*.tsx` (one file per screen) | `src/controllers/*.controller.ts` |
| `src/auth/` (provider and guards, cross-cutting) | `src/middleware/requireAuth.ts` |
| `src/api/client.ts` (one wrapper, one `ApiError`) | `src/errors/httpError.ts` + `errorHandler` |

Conventions to preserve:

- **One fetch wrapper.** Every request goes through `request<T>()` in
  `src/api/client.ts`, the only place `fetch` is called and the only place an error
  becomes an `ApiError` (carrying `status`, `message`, and the optional `field`).
  Components never branch on `res.ok`. The single deliberate exception is the
  direct-to-S3 `PUT` in `src/api/uploads.ts`, which uses a bare `fetch` because the
  wrapper is `/api`-only, same-origin, and cookie-bearing, while S3 is a third-party
  origin authorized by the signed URL. Keep it isolated there so no screen touches S3.
- **No base URL, ever.** The client prefixes `/api` and nothing else. Vite proxies it
  in dev, Nginx in production. A `VITE_API_URL` would make every request cross-origin
  and break the session cookie, since the backend mounts no CORS middleware on
  purpose. If anyone reaches for CORS config, the proxy is broken.
- **Types live next to the code that owns them**, under an `// --- API shapes ---`
  banner, transcribed from the owning backend service. There is no shared
  `types/api.ts` barrel, for the same reason the backend has none.
- **Auth status is three states, not a boolean** (`'loading' | 'authenticated' |
  'anonymous'`). The guards *hold* on `'loading'` rather than redirecting; otherwise
  every authenticated user who hard-refreshes a deep link is bounced to `/login` and
  loses their destination. `GET /api/auth/session` answering `401` is the normal
  logged-out path, and `api/auth.ts` is the single place that becomes `null`, so
  everything else still throws and an outage is never mistaken for a logout.
- **Guards are layout routes**, not per-element wrappers. One `<RequireAuth />`
  renders an `<Outlet />` for its subtree, so the rule can't drift between routes.
  Client-side guards are UX only; the API is the sole authority.
- **`routes.tsx` exports both `routes` and `router`**, so the table can be driven by
  `createMemoryRouter` in a test at any path while `router` binds real browser history
  for `main.tsx`. Same split, same reason, as `app.ts` versus `server.ts`.
- **`createBrowserRouter` for the table and `errorElement` only.** No `loader`s, no
  `action`s. Screens fetch through `src/api/*`, so there is one data story. Don't
  half-adopt the data APIs later.
- **CSS Modules plus global tokens.** Three global stylesheets (`reset`, `tokens`,
  `base`) imported once in `main.tsx`; everything else is `Component.module.css`
  beside its component. Components reference `var(--color-…)` and `var(--space-…)`
  and never hardcode a colour or a spacing value.
- **Relative imports only, no path aliases.** Adding one would need duplicate config
  across `tsconfig`, `vite.config`, and `vitest.config`.
- **No data-fetching or state library.** This was re-evaluated once the interactive
  screens landed and deliberately kept: screens mount one at a time and each refetches
  on mount, so the only real requirement was optimistic-with-rollback on the clicked
  element, which `hooks/usePostToggles` does with local state. Screens own their
  loading state via `hooks/useAsync`. Revisit only if a genuine co-mounted
  cross-screen cache need appears.
- **The image key intent model.** `ImageUploadField` reports `unchanged`, `set`, or
  `removed`. A `PATCH` omits the field entirely when unchanged, so the stored image is
  preserved; `set` sends the new key and `removed` sends `null`. Omission is
  load-bearing, not laziness.

### Testing

Vitest in two projects (`frontend/vitest.config.ts`), mirroring the backend split:

- **unit**: co-located `src/**/*.test.{ts,tsx}`, jsdom, `fetch` stubbed.
- **integration**: `frontend/tests/integration/**`, rendering the **real** route table
  and the real `AuthProvider` against **MSW** handlers. MSW intercepts at the network
  layer, so the real `api/client.ts` executes with its real error mapping, which is
  the same parity `supertest` buys the backend against `posthub_test`.

```
docker compose exec web npm test             # both projects
docker compose exec web npm run test:unit    # / test:integration / test:watch
docker compose exec web npm run typecheck    # tsc --noEmit
```

Same rule as the backend: don't pad with unit tests that only assert a URL string was
built. For thin pass-throughs the integration test is the one that matters.

## Infrastructure

Lives in `infra/` (Terraform, AWS provider `~> 6.0`). Every AWS resource the
production stack runs on is code: `terraform apply` builds it from an empty account,
`terraform destroy` removes it again. This replaced a click-through-the-console setup,
so **the console is no longer the source of truth. These files are.** `infra/README.md`
explains each configuration file and holds the apply and teardown flows; don't
duplicate it here.

One file per resource group, the same one-concern-per-file discipline as the backend's
routers:

| File | Creates |
| --- | --- |
| `providers.tf` | Terraform + AWS provider pins, region |
| `variables.tf` / `outputs.tf` | Inputs, and the values the app's `.env` needs |
| `s3.tf` | Private uploads bucket + public-access block |
| `cloudfront.tf` | OAC, distribution, and the bucket policy trusting only it |
| `iam.tf` | EC2 instance role, its `s3:PutObject` policy, instance profile |
| `network.tf` | App and database security groups |
| `ec2.tf` | SSH key pair and the app server |
| `s3_cors.tf` | Bucket CORS, allowing browser `PUT` from the app's origin |
| `rds.tf` | Subnet group and the Postgres instance |

Conventions to preserve:

- **Nothing secret is ever committed.** `infra/.gitignore` is GitHub's canonical
  `Terraform.gitignore`, covering `*.tfstate`, `*.tfvars`, and `.terraform/`. State
  matters most: it holds the RDS master password **in plaintext**. The one Terraform
  file that *is* committed is `.terraform.lock.hcl`, the provider checksum lock and
  the `package-lock.json` analog, not a secret.
- **No static AWS credentials anywhere**, at either layer. Terraform resolves
  short-lived credentials exactly as the CLI does (`aws login`, a 12-hour browser
  session, no key to leak or rotate), and the deployed backend signs upload URLs with
  credentials the SDK reads from **instance metadata** via
  `aws_iam_instance_profile.app`. That is why `AWS_ACCESS_KEY_ID` and
  `AWS_SECRET_ACCESS_KEY` are absent from the production `.env`, and must stay absent.
- **The DB password is a `sensitive` variable with no default**, supplied through
  `TF_VAR_db_password` or an interactive prompt. `sensitive` redacts it from terminal
  output and logs, *not* from state on disk, which is what makes the gitignore point
  above load-bearing. Moving it to Secrets Manager (`manage_master_user_password`) is
  the known fix, deliberately deferred.
- **The bucket is private and stays private.** Reads go through CloudFront,
  authenticated by an Origin Access Control scoped to that one distribution; writes are
  presigned `PUT`s straight from the browser. The bucket policy's `AWS:SourceArn`
  condition is what prevents the confused-deputy problem, so don't loosen it. The
  origin must use `bucket_regional_domain_name`, never `bucket_domain_name`, which
  redirects and silently breaks SigV4 signing.
- **Terraform orders itself from references; never sequence by hand.** The only
  ordering this config declares is `s3_cors.tf` reading `aws_instance.app.public_ip`,
  which is precisely why CORS is a separate resource from the bucket, in its own file.
  Reach for `depends_on` only when a dependency genuinely can't be expressed as a
  reference (the bucket policy and public-access-block pair is the one such case).
- **Free-tier limits are checked by AWS at call time, not at plan time**, so a clean
  `plan` can still fail on `apply` (it has, twice: instance type and backup retention).
  `db_backup_retention_days` and `instance_type` exist as variables for that reason.
- **State is local and unlocked.** One operator, one machine. Losing it means Terraform
  forgets these resources exist and tries to recreate them; an S3 backend with locking
  is the first thing to add if anyone else ever applies this.
- **`terraform fmt` before committing.** `fmt -check` exits non-zero on unformatted
  files.

Terraform owns the **infrastructure**; the production section of `README.md` owns the
**deploy** onto it: clone, write `.env` from `terraform output`, generate the
self-signed certificate, bring up `docker-compose.prod.yml`, migrate, seed.

## Architecture

PostgreSQL database, a REST backend, and a React frontend that talks to it through a
same-origin proxy, so client code never addresses the backend host or port directly.
Session-based auth via cookie, with sessions persisted using `connect-pg-simple` (a
library-managed table, deliberately absent from the ERD).

That proxy has two concrete implementations, and they are the only places the backend's
address appears: `frontend/vite.config.ts` (`server.proxy`) in dev, and the nginx
`location /api/` block in production, where Nginx also serves the built static bundle.
There are two nginx configs: the committed `frontend/nginx.conf` is the plain `:80`
variant baked into the image, and `frontend/nginx.prod.conf` is mounted over it by
`docker-compose.prod.yml` to terminate TLS on `:443`.

Two edge behaviours are load-bearing:

- **SPA history fallback is the frontend edge's job, not the API's.** The backend
  JSON-404s every non-`/api` path by design, so `try_files $uri $uri/ /index.html` is
  what makes a hard refresh on a deep link work.
- **`app.ts` sets `trust proxy: 1` under `NODE_ENV=production`**, which is why the
  nginx config must forward the `X-Forwarded-*` headers. Without them Express can't
  derive `req.secure`, and `express-session` silently never emits the `Secure` cookie.

**Domain model** (see `docs/database.md`): `users`, `posts`, and `comments` are the
core content tables. `post_likes`, `bookmarks`, `follows`, and `post_categories` are
join tables with **composite primary keys** and no surrogate `id`: the pair itself is
the identity, which makes "did I like this?" a fast PK lookup rather than a scan.
`comments` looks like a join table (two FKs: `post_id`, `author_id`) but isn't, since
it carries content and allows repeats, so it needs its own surrogate key. `follows`
and `notifications` are self-referential on `users`.

Key conventions worth preserving when touching the schema or API:

- **No `role` column, no roles.** Authorization is purely ownership-based: a write
  succeeds if `author_id` (or equivalent) matches the session user, otherwise `403`.
  Don't introduce role checks without a real requirement. The model is designed so
  roles would be a purely additive migration later.
- **Counts are derived (`COUNT(*)`), never denormalized counters.** Resist adding
  `like_count` or `comment_count` columns; correctness before performance.
- **Follow direction: `follower_id` and `followee_id`** (the `-er`/`-ee` pair), never
  `following_id`. The two names are one letter apart and a swap silently inverts the
  feed. Treat this naming as fixed across schema, services, and API responses.
- **Usernames are immutable** and are the identifier for user-facing routes
  (`/api/users/:username`); every other resource (`posts`, `comments`,
  `notifications`) is addressed by numeric `id`. `PATCH /api/users/me` must reject a
  `username` field in the body with `400` rather than silently dropping it.
- **Toggle relationships (likes, bookmarks, follows) use `PUT` and `DELETE`, not
  `POST`,** and are idempotent: liking twice or unfollowing twice is not an error.
  Toggle endpoints return the new state (`likeCount`, `likedByMe`) instead of `204`,
  so the client updates in place with no refetch.
- **`PATCH` is partial update everywhere.** There is no `PUT` for posts, comments, or
  profiles, since full-replacement semantics would force the client to resend
  unchanged fields.
- **Uploads are presigned, direct-to-S3.** `POST /api/uploads/presign` returns a
  presigned URL and object key; the client `PUT`s bytes straight to S3 and only ever
  sends the resulting `key` (`imageKey`, `avatar_key`) to the backend. Image bytes
  never transit the API server.
- **`401` versus `403` is kept honest**: `401` means no valid session, `403` means
  authenticated but not the owner. `getSession` returns `401` rather than
  `200 {user: null}`, so the client's "am I logged in" check and its error handling
  share one code path.
