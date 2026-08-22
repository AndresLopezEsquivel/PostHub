# Setting up production (single EC2 + Docker Compose + RDS)

How to run the **production** build of PostHub on one EC2 instance with the
Compose stack, terminating TLS at the nginx edge with a self-signed certificate,
against a managed **RDS** Postgres database.

This is a manual, single-box deploy meant for a genuine `NODE_ENV=production`
smoke test — it exercises the real secure-cookie / `trust proxy` /
`X-Forwarded-Proto` chain that plain HTTP cannot. The only thing that isn't
production-grade is the certificate's *trust*, which doesn't affect the cookie
mechanism. See "When it gets real" at the end for the remaining upgrade path.

## How it fits together

```
browser ──HTTPS(443)──▶ nginx (web, TLS terminates here)
                          ├─ /            → built SPA bundle
                          └─ /api/  ──────▶ api:4000  (Express, internal network)
                                              └──TLS──▶ RDS Postgres (managed, in-VPC)
```

- **nginx terminates TLS**, so `$scheme` is `https` and it forwards
  `X-Forwarded-Proto: https` to Express. Under `NODE_ENV=production`,
  `app.ts` sets `trust proxy: 1`, Express derives `req.secure = true`, and
  `express-session` emits the `Secure` `posthub.sid` cookie. Over plain HTTP that
  header would be `http` and the cookie would be silently dropped.
- **`api` is not published to the host** — nginx reaches `api:4000` over the
  internal Compose network. **There is no local `db` container in prod**: the
  database is RDS, reached over TLS (`DATABASE_SSL=true`).
- Only **443** faces the internet.

## Two standalone compose files

`docker-compose.yml` and `docker-compose.prod.yml` are **independent**, not a
base + override — dev and prod share too little for layering to pay off. Each file
is the complete truth for its environment; you never combine them.

| File | Role |
| --- | --- |
| `docker-compose.yml` | **Dev only.** Local Postgres, hot-reload bind mounts, host ports, throwaway creds. `docker compose up` — zero config. Not used in prod. |
| `docker-compose.prod.yml` | **Prod only, self-contained.** `target: production`, `NODE_ENV=production`, no bind mounts, no `db` service, mounts the cert + prod nginx config, publishes 443, RDS via `DATABASE_URL`. Run with `-f docker-compose.prod.yml`. |
| `frontend/nginx.prod.conf` | TLS-terminating nginx config, mounted over the image's baked-in `nginx.conf` (which stays the plain-`:80`, upstream-TLS variant). |
| `.env` (git-ignored) | Real `DATABASE_URL` (RDS) + `SESSION_SECRET` (+ optional S3 vars). Copy from `.env.example`. |
| `certs/` (git-ignored) | The self-signed `cert.pem` + `key.pem`, generated on the instance. |

## Prerequisites (once per instance)

- Docker + the Compose plugin, and `openssl`.
- An **RDS Postgres** instance in the same VPC as the EC2 box, with a security
  group that allows inbound **5432 from the EC2 instance's SG only** ("Publicly
  accessible" off). Note its endpoint, user, password, and database name.
- EC2 security group: allow inbound **22** (SSH) and **443** (HTTPS), scoped to
  your IP. Port 80 is not used. Do **not** open 4000.
- The repo cloned onto the box.

## Deploy

### 1. Secrets

```bash
cp .env.example .env
nano .env        # set DATABASE_URL to the RDS endpoint and a long random
                 # SESSION_SECRET (e.g. `openssl rand -hex 32`)
```

`.env` is auto-loaded by Compose and is git-ignored. In prod you set
`DATABASE_URL` explicitly (RDS); `DATABASE_SSL=true` is already hardcoded in
`docker-compose.prod.yml`. The prod file has **no dev fallback** for
`DATABASE_URL`/`SESSION_SECRET` — a missing value fails the run fast with a clear
message.

```
DATABASE_URL=postgresql://<user>:<pass>@<rds-endpoint>:5432/<db>
SESSION_SECRET=<openssl rand -hex 32>
```

### 2. Self-signed certificate

The public IP changes on every stop/start (no Elastic IP), and the IP is baked
into the cert's SAN — so **regenerate this after each restart** with the new IP.

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/key.pem -out certs/cert.pem -days 365 \
  -subj "/CN=posthub" -addext "subjectAltName=IP:<EC2_PUBLIC_IP>"
chmod 600 certs/key.pem
```

`-nodes` leaves the key unencrypted so nginx starts unattended. The `-x509` form
overwrites `cert.pem`/`key.pem` in place, so there's nothing to delete first on a
regeneration — but you must reload nginx afterward (see "Restart" below).

### 3. Build and start

The prod file is self-contained, so just name it — no second `-f`, no service
list:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Migrate + seed

The production image ships the compiled `dist/` and has no `tsx`, so run the
compiled entry points (not `npm run migrate`, which invokes `tsx`). These run
against RDS, which starts empty:

```bash
docker compose -f docker-compose.prod.yml run --rm api node dist/db/migrate.js
docker compose -f docker-compose.prod.yml run --rm api node dist/db/seed.js
```

`migrate` is a deploy step, never a boot step — the server never runs it.
`seed` inserts the category reference data (idempotent, production-safe) that
`createPost` needs.

### 5. Verify

Browse `https://<EC2_PUBLIC_IP>`, click through the browser's certificate warning
(expected — the cert is self-signed and has no CA trust), then register/log in.
If the session sticks across a page reload, the whole secure-cookie chain **and**
the RDS-backed session store are working. `curl -sk https://<IP>/api/health`
should report the database OK.

## Restart / stop-start cycle

Stopping and starting the instance assigns a **new public IP**, invalidating the
cert's SAN. Each time the box comes back up:

```bash
# 1. Regenerate the cert with the new IP (step 2 above)
# 2. Reload nginx so it picks up the new cert:
docker compose -f docker-compose.prod.yml restart web
# 3. Re-accept the browser warning (it's a brand-new cert)
```

The Postgres data lives in **RDS**, independent of the EC2 box, so it survives
instance stop/start with nothing to re-migrate or re-seed.

## Gotchas

- **No HSTS while self-signed.** Do not add a `Strict-Transport-Security` header:
  once a browser caches it for the host, you can no longer click through the cert
  warning, and it's painful to undo.
- **Cert files must exist before `up`.** nginx fails to start if
  `ssl_certificate` points at missing files — generate the cert (step 2) first.
- **RDS security group must allow the EC2 SG on 5432.** If `api` can't connect,
  check that inbound rule first; a `connection timeout` in the api logs is almost
  always the SG.
- **The committed `nginx.conf` is untouched.** TLS lives only in
  `nginx.prod.conf`, mounted by the prod file, so the plain-`:80` variant stays
  the default for local use.

## When it gets real

This setup is a smoke test, not a durable production posture. RDS is already in
place; to harden the rest:

- **Stable address + real cert.** Allocate an **Elastic IP** (survives
  stop/start, so the cert stays valid) and point a domain at it, then issue a
  **Let's Encrypt** cert (needs port 80 open for the HTTP-01 challenge) — or move
  TLS termination to an **ALB / CloudFront** and revert the edge to the committed
  `nginx.conf` (upstream-TLS) variant, forwarding `X-Forwarded-Proto` from the
  terminator.
- **Tighten RDS.** Turn off "Publicly accessible" if not already, keep automated
  backups on (retention ≥ 1 day) for anything you'd miss, and consider Multi-AZ.
- **Secret management.** Keep `.env` off the box where possible (SSM Parameter
  Store / Secrets Manager); never commit a real password — git history is forever.
