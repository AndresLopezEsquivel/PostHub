# Backend setup — PostHub

How to get the `backend/` service running locally. Everything runs through Docker Compose —
no local Node.js/npm install is required.

**Current state:** the backend is a structural scaffold only (see `CLAUDE.md` and
`backend/src/routes/`). Every route is mounted but empty, so every request currently returns
`404 { "error": { "message": "Not found" } }` — that's expected until handlers are implemented
resource by resource.

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

Both `api` and `db` should show `Up`, with `db` reporting `(healthy)`.

Hit any mounted API path — since no handlers exist yet, every one currently 404s with the shared
error envelope, which confirms Express itself booted and is routing correctly:

```
curl -i http://localhost:4000/api/posts
curl -i http://localhost:4000/api/users/andres
```

Expected: `HTTP/1.1 404 Not Found` with body `{"error":{"message":"Not found"}}`.

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
docker run --rm -v "$(pwd)/backend:/app" -w /app node:20-alpine npm install --package-lock-only
```

**Port already in use.** Something else on the host is bound to `4000` or `5432`. Stop it, or
change the host-side port mapping in `docker-compose.yml` (e.g. `"4001:4000"`).
