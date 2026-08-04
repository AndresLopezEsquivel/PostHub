# Backend setup — PostHub

How to get the `backend/` service running locally. Everything runs through Docker Compose —
no local Node.js/npm install is required.

**Current state:** the backend API surface is complete. All nine resource groups — categories,
auth, posts, likes/bookmarks, comments, users/follows, feed, notifications, and uploads — are
implemented and tested against `docs/api_design.md`. The one dormant endpoint is
`POST /api/uploads/presign`, which returns `503 { "error": { "message": "Uploads are not
configured" } }` until its four S3 environment variables are set.

For the frontend that consumes this API, see [`frontend_setup.md`](./frontend_setup.md).

---

## Prerequisites

- Docker Engine
- Docker Compose (the `docker compose` CLI plugin, not the old standalone `docker-compose`)

Check both are available:

```
docker --version
docker compose version
```

---

## First-time setup

Nothing to install — `backend/package-lock.json` is checked into the repo, and the Dockerfile
installs dependencies inside the image via `npm ci`. From the repo root:

```
docker compose up --build
```

This builds the `api` image (targeting the `dev` stage in `backend/Dockerfile`) and starts two
services:

| Service | Image | Port | Purpose |
| --- | --- | --- | --- |
| `api` | built from `backend/Dockerfile` | `4000` | The Express app, running under `tsx watch` |
| `db` | `postgres:16-alpine` | `5432` | Postgres, per `docs/database_design.md` |

Add `-d` to run in the background:

```
docker compose up --build -d
```

---

## Verifying it's running

```
docker compose ps
```

`api` and `db` should show `Up`, with `db` reporting `(healthy)`. (`web` appears here too — see
[`frontend_setup.md`](./frontend_setup.md).)

The health endpoint confirms both that Express booted and that it can reach Postgres:

```
curl -i http://localhost:4000/api/health
```

Expected: `HTTP/1.1 200 OK` with body `{"status":"ok","database":"ok"}`. A `503` with
`"database":"error"` means the app is up but the database isn't reachable.

Note that content endpoints return empty results until the schema is applied and seeded — see
the next section:

```
curl -i http://localhost:4000/api/posts
```

---

## Database: migrations and seeds

The schema is not applied by starting the stack. `docker compose up` gives you an **empty**
Postgres; you then run the migration and seed scripts explicitly. They live in `backend/` and
run inside the `api` container (which already has the connection string and dependencies):

```
docker compose exec api npm run migrate    # create/upgrade the schema
docker compose exec api npm run seed        # seed categories (reference data)
docker compose exec api npm run seed:dev    # + dev sample users/posts/… (destructive)
```

| Command | What it does | Safe to re-run? |
| --- | --- | --- |
| `npm run migrate` | Applies every `backend/migrations/*.sql` not yet applied, in order, each in its own transaction. Records applied files in a `schema_migrations` table. | Yes — already-applied files are skipped. |
| `npm run seed` | Inserts the category lookup rows (`ON CONFLICT DO NOTHING`). | Yes — idempotent, never duplicates. |
| `npm run seed:dev` | **Truncates the domain tables** and inserts a known graph of users, posts, comments, likes, bookmarks, and follows. Refuses to run when `NODE_ENV=production`. | Yes, but it wipes existing content first. |

Typical first run against a fresh database:

```
docker compose up --build -d
docker compose exec api npm run migrate
docker compose exec api npm run seed:dev     # seeds categories too, so seed is optional here
```

Migrations are **forward-only** — migrations only move the schema forward; you can't roll one back. To start completely clean, drop the volume and re-migrate:

```
docker compose down -v
# -v removes named volumes declared in the "volumes" section of the Compose file
# and anonymous volumes attached to containers
docker compose up --build -d
docker compose exec api npm run migrate
```

Adding a schema change later means adding a **new** numbered file under `backend/migrations/`
(e.g. `011_add_something.sql`) and re-running `npm run migrate` — never editing a file that has
already been applied.

Seeded dev users all share the password `password123` (throwaway, local only).

> **Note on production / RDS:** `npm run migrate` is designed to run as a one-off **deploy step**
> (an ECS run-task or release command), not at application boot —
> run migrations as a separate deploy step, not automatically when the app starts
> It takes an advisory lock so two concurrent deploys can't
> race, and honours TLS via `DATABASE_SSL=true` for managed databases that require it. The
> production image ships the `.sql` files alongside the compiled `dist/` so the runner has
> something to apply.

---

## Running the tests

The suite uses [Vitest](https://vitest.dev/) and runs in two layers:

- **unit** — fast, no database. Collaborators are mocked; co-located next to the
  code as `src/**/*.test.ts`.
- **integration** — the real Express app driven with `supertest` against a
  dedicated **`posthub_test`** database (never the dev database). Lives under
  `backend/tests/integration/`.

One-time, create and migrate the test database (idempotent — safe to re-run, and
re-run it after adding a migration):

```
docker compose exec api npm run test:setup
```

Then run the tests:

```
docker compose exec api npm test              # both layers
docker compose exec api npm run test:unit         # unit only (no DB needed)
docker compose exec api npm run test:integration  # integration only
docker compose exec api npm run test:watch        # watch mode during a pass
```

The `test` scripts hard-code `DATABASE_URL` to `posthub_test`, and the
integration setup refuses to run against any database whose name doesn't end in
`_test` — so tests can never truncate your dev data. Integration files run
serially because they share the one test database.

> **After changing `package.json`** (e.g. adding a test dependency) the image
> must rebuild *and* the container's `node_modules` volume must be renewed, or
> the new binary won't be visible:
>
> ```
> docker compose up --build -d --renew-anon-volumes
> ```

---

## Development workflow

`backend/` is bind-mounted into the `api` container, and the container runs
`npm run dev` (`tsx watch src/server.ts`). Editing any file under `backend/src/` on the host
triggers an automatic restart inside the container — no rebuild needed. Watch it happen:

```
docker compose logs -f api
```

Rebuild the image only when `backend/package.json` (or the `Dockerfile` itself) changes:

```
docker compose up --build -d
```

---

## Environment variables

Set by `docker-compose.yml` for the `api` service when running under Compose:

| Variable | Compose value | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Port the Express app listens on |
| `NODE_ENV` | `development` | Read in `backend/src/config/env.ts` |
| `DATABASE_URL` | `postgresql://posthub:posthub@db:5432/posthub` | Connection string for `backend/src/db/pool.ts` |

`backend/.env.example` documents the same variables for any tooling that runs outside Compose
(e.g. an editor's TypeScript language server). Copy it to `backend/.env` if needed — that file is
git-ignored.

---

## Stopping

```
docker compose down
```

Add `-v` to also delete the `posthub_pgdata` volume (wipes the database):

```
docker compose down -v
```

---

## Troubleshooting

**`npm ci` fails during build with a lockfile error.** `backend/package-lock.json` is checked
in, so this should only happen after editing `backend/package.json` by hand. Regenerate it
without needing Node installed locally, using a throwaway container:

```
docker run --rm -u "$(id -u):$(id -g)" -e npm_config_cache=/tmp/.npm \
  -v "$(pwd)/backend:/app" -w /app node:20-alpine npm install --package-lock-only
```

The `-u` and `npm_config_cache` flags keep the generated file owned by you rather than root.

**Port already in use.** Something else on the host is bound to `4000` or `5432`. Stop it, or
change the host-side port mapping in `docker-compose.yml` (e.g. `"4001:4000"`).
