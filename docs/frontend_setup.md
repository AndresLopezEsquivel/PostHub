# Frontend setup — PostHub

How to get the `frontend/` service running locally. Everything runs through Docker Compose —
no local Node.js/npm install is required.

**Current state:** the frontend is a structural scaffold only (see `CLAUDE.md`). The shell is
real — routing, the session bootstrap, the nav, the error boundary, and the fetch wrapper all
work — but all twelve screens from `docs/screens.md` are placeholders that render a heading and
"Not implemented yet." Screens land one pass at a time, in the order recorded in `CLAUDE.md`.

---

## Prerequisites

- Docker Engine
- Docker Compose (the `docker compose` CLI plugin, not the old standalone `docker-compose`)

---

## First-time setup

Nothing to install — `frontend/package-lock.json` is checked into the repo, and the Dockerfile
installs dependencies inside the image via `npm ci`. From the repo root:

```
docker compose up --build -d
```

This starts three services:

| Service | Image | Port | Purpose |
| --- | --- | --- | --- |
| `web` | built from `frontend/Dockerfile` (target `dev`) | `5173` | Vite dev server, with HMR and the `/api` proxy |
| `api` | built from `backend/Dockerfile` (target `dev`) | `4000` | The Express app under `tsx watch` |
| `db` | `postgres:16-alpine` | `5432` | Postgres |

The built bundle behind the real Nginx lives in the **standalone** production
stack (`docker-compose.prod.yml`, a separate self-contained file — not an override
of this one), where the service is named `web` and terminates TLS on `443`. See
[`set_up_production.md`](./set_up_production.md).

The app needs a schema and some content to be interesting — see
[Database: migrations and seeds](./backend_setup.md#database-migrations-and-seeds):

```
docker compose exec api npm run migrate
docker compose exec api npm run seed:dev
```

---

## Verifying it's running

Open <http://localhost:5173>. You should see the PostHub nav bar with **Explore**, **Log in**,
and **Register**, over the Explore placeholder.

The check that actually matters is that the proxy works, because everything else depends on it:

```
curl -i http://localhost:5173/api/health
```

Expected: `HTTP/1.1 200 OK` with body `{"status":"ok","database":"ok"}`. That request went to the
Vite dev server on `5173`, which forwarded it to the API on `4000` — the client never addressed
the backend directly. If this 404s, the proxy is misconfigured and nothing auth-related will work.

---

## The same-origin proxy

This is the one architectural constraint the frontend has to honour, and it comes from
`docs/api_design.md`:

> **Transport:** the client only ever addresses the frontend origin. The frontend server proxies
> `/api/*` to this backend, so no host or port appears in client code.

Two implementations of that one rule:

| | Dev | Production |
| --- | --- | --- |
| Serves the app | Vite dev server (`frontend/vite.config.ts`) | Nginx (`frontend/nginx.conf`) |
| Proxies `/api` | `server.proxy` → `http://api:4000` | `location /api/` → `http://api:4000` |
| SPA history fallback | built in | `try_files $uri $uri/ /index.html` |

Consequences worth knowing before changing anything:

- **Client code contains no base URL, host, or port.** `src/api/client.ts` prefixes `/api` and
  nothing else. Introducing a `VITE_API_URL` would make every request cross-origin, which breaks
  the session cookie outright — the backend mounts no CORS middleware, on purpose.
- **The session cookie is first-party.** The browser sees one origin (`localhost:5173`), so
  `posthub.sid` is set on it and travels back automatically. It is `httpOnly`, so JS can never
  read it; `GET /api/auth/session` is the only way to learn whether you are logged in.
- **SPA fallback is the frontend edge's job.** The backend JSON-404s every non-`/api` path by
  design, so without `try_files` a hard refresh on `/posts/42` would 404 in production.

---

## Development workflow

`frontend/` is bind-mounted into the `web` container, which runs `npm run dev` (`vite`). Editing
anything under `frontend/src/` hot-reloads in the browser with no rebuild. Watch it:

```
docker compose logs -f web
```

Rebuild the image only when `frontend/package.json` or the `Dockerfile` changes — and see the
note under [Troubleshooting](#troubleshooting) about renewing the `node_modules` volume when you do.

---

## Running the tests

The suite uses [Vitest](https://vitest.dev/) and runs in two layers, mirroring the backend's split:

- **unit** — co-located `src/**/*.test.{ts,tsx}`, jsdom, `fetch` stubbed. No network.
- **integration** — `frontend/tests/integration/`, which renders the **real** route table and the
  real `AuthProvider` against [MSW](https://mswjs.io/) handlers. MSW intercepts at the network
  layer, so the real `src/api/client.ts` executes — the same parity `supertest` buys the backend.

```
docker compose exec web npm test               # both layers
docker compose exec web npm run test:unit
docker compose exec web npm run test:integration
docker compose exec web npm run test:watch     # during a pass
docker compose exec web npm run typecheck      # tsc --noEmit
```

There is no `test:setup` equivalent — the frontend has no database.

---

## Checking production parity

The dev server and Nginx differ in exactly two ways: SPA history fallback and cache headers.
Both are exercised by the **standalone production stack** — a separate, self-contained
`docker-compose.prod.yml` (not an override of this dev file). Bringing it up is the full deploy
flow (TLS certs + a `DATABASE_URL` pointing at RDS in `.env`); see
[`set_up_production.md`](./set_up_production.md).

Once it's up on the box, the two Nginx behaviors are verifiable over HTTPS (`-k` accepts the
self-signed cert):

```
curl -ik https://<host>/posts/42     # 200 text/html — SPA fallback, not a 404
curl -ik https://<host>/api/health   # proxied JSON
curl -skI https://<host>/index.html  | grep -i cache-control   # no-cache
curl -skI https://<host>/assets/<hashed>.js | grep -i cache-control   # public, max-age=31536000, immutable
```

`index.html` is the one unhashed file — it names the current asset hashes, so a cached copy would
boot the previous deploy's bundle. Everything under `/assets/` is fingerprinted by Vite, so it is
cached immutably and a missing one deliberately 404s rather than falling back to `index.html`
(a missing asset is a broken deploy, and answering it with HTML would bury that under an
"unexpected token '<'" console error).

---

## Environment variables

Set by `docker-compose.yml` for the `web` service:

| Variable | Compose value | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Standard Node convention |
| `API_PROXY_TARGET` | `http://api:4000` | Where the Vite dev server forwards `/api` |

`API_PROXY_TARGET` is deliberately **not** `VITE_`-prefixed. Vite inlines `VITE_*` variables into
the client bundle by design, and an API host reachable from client code is exactly what
`api_design.md` forbids. It is read in `vite.config.ts`, in Node, at config time, and can never
reach a browser.

Inside Compose the target is the service name `api`, resolved on the default network. Running
Vite outside Compose, the default `http://localhost:4000` works because the `api` service
publishes that port to the host.

`nginx.conf` hardcodes the same `http://api:4000`. That is the one line to change when the
backend moves to an ECS service or a k8s Service DNS name.

---

## Stopping

```
docker compose down
```

---

## Troubleshooting

**`npm ci` fails during build with a lockfile error.** `frontend/package-lock.json` is checked in,
so this should only happen after editing `frontend/package.json` by hand. Regenerate it without
Node installed locally, using a throwaway container:

```
docker run --rm -u "$(id -u):$(id -g)" -e npm_config_cache=/tmp/.npm \
  -v "$(pwd)/frontend:/app" -w /app node:22-alpine npm install --package-lock-only
```

The `-u` and `npm_config_cache` flags keep the generated file owned by you rather than root.

**A newly added dependency isn't found.** After changing `frontend/package.json`, rebuilding
alone is not enough: the anonymous `node_modules` volume still masks the image's fresh install.

```
docker compose up --build -d --renew-anon-volumes
```

(The same applies to `backend/`. Note Vite's dep-optimization cache lives at `node_modules/.vite`,
inside that volume — clearing it means renewing the volume, not deleting a host directory.)

**Port already in use.** Something else on the host is bound to `5173`. Stop it, or change the
host-side mapping in `docker-compose.yml` — e.g. `"5174:5173"`. Change only the left-hand side;
`vite.config.ts` sets `strictPort`, so the container-side port is fixed.

**The prod `web` (Nginx) exits immediately with `host not found in upstream "api"`.** Nginx
resolves `proxy_pass http://api:4000` **once at startup** and refuses to start if the name
doesn't resolve. `depends_on: [api]` in `docker-compose.prod.yml` covers this; start the API
first. In an orchestrator where the backend can be replaced under a stable name, switch to a
`resolver` directive plus a variable so the name is re-resolved per request (noted in
`nginx.conf`).

**`502 Bad Gateway` from the prod `web` (Nginx) right after starting it.** Nginx is up but the
API is still booting. Wait a few seconds and retry; check with `docker compose logs api`.

**Everything 401s, or logging in appears not to stick.** Confirm the proxy first
(`curl -i http://localhost:5173/api/health`). If requests are reaching the API but the session
doesn't persist, check that the browser is addressing `localhost:5173` and not `localhost:4000` —
hitting the API directly sets the cookie on the wrong origin, and the frontend will never send it.
