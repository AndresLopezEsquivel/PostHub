# PostHub

## Docker

### Backend's `Dockerfile`

* `backend/Dockerfile` is a multi-stage Dockerfile for building and running PostHub's backend API server.
* Four stages: `deps`, `dev`, `build`, and `production`.

#### `deps` stage:

```
docker build --target deps -t posthub-api-deps .
```

* Base image: `node:20-alpine`.
* Sets image's working directory to `/app`.
* Copies `package.json` and `package-lock.json` to the filesystem of the image at `/app`.
* Runs `npm ci` to install PostHub dependencies into the image's filesystem at `/app/node_modules`.


#### `dev` stage:

```
docker build --target dev -t posthub-api-dev .
```

* Base image: `deps`.
* Sets image's working directory to `/app`.
* Copies the entire PostHub source code to the image's filesystem at `/app`.
* Runs `npm run dev` (runs PostHub's api server via `tsx watch src/server.ts`). Executes TypeScript file `src/server.ts` (no type checking, no emitted JavaScript files) and watches for changes in the source code to restart the server automatically.

#### `build` stage:

```
docker build --target build -t posthub-api-build .
```

* Base image: `deps`.
* Sets image's working directory to `/app`.
* Copies the entire PostHub source code to the image's filesystem at `/app`.
* Runs `npm run build` (runs `tsc -p tsconfig.json`). This compiles and type-checks the TypeScript source code (`src/**/*.ts`) and emits JavaScript files to the image's filesystem at `/app/dist`.

#### `production` stage:

```
docker build --target production -t posthub-api-production .
```

* Base image: `node:20-alpine`.
* Sets image's working directory to `/app`.
* Sets environment variable `NODE_ENV=production`.
* Copies `package.json` and `package-lock.json` to the filesystem of the image at `/app`.
* Runs `npm ci --omit=dev` to install only production dependencies into the image's filesystem at `/app/node_modules`.
* Copies the compiled JavaScript files from the `build` stage to the image's filesystem at `/app/dist`.
* Copies the database migration files (`backend/migrations`) to the image's filesystem at `/app/migrations`.
* Via `EXPOSE 4000`, documents that the container listens on port 4000 at runtime.
* Runs `node dist/server.js` to start the production version of PostHub's backend API server.

### Frontend's `Dockerfile`

* `frontend/Dockerfile` is a multi-stage Dockerfile for building and running PostHub's frontend web application.
* Four stages: `deps`, `dev`, `build`, and `production`.

#### `deps` stage:

```
docker build --target deps -t posthub-web-deps .
```

* Base image: `node:22-alpine`.
* Sets image's working directory to `/app`.
* Copies `package.json` and `package-lock.json` to the filesystem of the image at `/app`.
* Runs `npm ci` to install PostHub frontend dependencies into the image's filesystem at `/app/node_modules`.

#### `dev` stage:

```
docker build --target dev -t posthub-web-dev .
```

* Base image: `deps`.
* Sets image's working directory to `/app`.
* Copies the entire PostHub frontend source code to the image's filesystem at `/app`.
* Runs `npm run dev` (runs `vite`). Executes Vite development server and watches for changes in the source code to restart the server automatically.

#### `build` stage:

```
docker build --target build -t posthub-web-build .
```

* Base image: `deps`.
* Sets image's working directory to `/app`.
* Copies the entire PostHub frontend source code to the image's filesystem at `/app`.
* Runs `npm run build` (runs `tsc --noEmit && vite build`). This compiles and type-checks the TypeScript source code (`src/**/*.ts`) and emits JavaScript files to the image's filesystem at `/app/dist`.

#### `production` stage:

```
docker build --target production -t posthub-web-production .
```

* Base image: `nginx:alpine`.
* Copies `frontend/nginx.conf` to the image's filesystem at `/etc/nginx/conf.d/default.conf`.
* Copies the compiled JavaScript files from the `build` stage to the image's filesystem at `/usr/share/nginx/html`.
* Via `EXPOSE 80`, documents that the container listens on port 80 at runtime.
* Runs `nginx -g 'daemon off;'` to start the production version of PostHub's frontend web application.

### Docker Compose

* Since PostHub is a multi-container application, it uses Docker Compose.
* PostHub defines two Compose files: `docker-compose.yml` and `docker-compose.prod.yml`.

#### `docker-compose.yml`:

* For development purposes.
* Defines three services: `api`, `web`, and `db`.
* `web` depends on `api`, and `api` depends on `db`.
* Defines a named volume `posthub-pgdata` for persisting PostgreSQL database data.

##### `db` service:

* Uses `postgres:16-alpine` image.
* Restarts automatically unless stopped or removed.
* Sets environment variables for PostgreSQL database configuration:
  * `POSTGRES_USER=posthub`
  * `POSTGRES_PASSWORD=posthub`
  * `POSTGRES_DB=posthub`
* Mounts named volume `posthub-pgdata` to container's `/var/lib/postgresql/data`.
* Publishes container's port 5432 to the host machine so that the PostgreSQL database can be accessed from outside the container.
* Defines a health check to ensure that the PostgreSQL database is ready to accept connections.

##### `api` service:

* Builds the backend API server from `backend/Dockerfile` using the `dev` stage.
* Depends on a healthy `db` service.
* Enables hot reloading:
  * Mounts the entire PostHub source code (`backend/`) to the container's `/app` directory.
  * Mounts the `node_modules` directory from the `deps` stage.
* Publishes container's port 4000 to the host machine so that the backend API server can be accessed from outside the container.
* Defines environment variables (e.g., `NODE_ENV=development`, `DATABASE_URL=postgresql://posthub:posthub@db:5432/posthub`).

##### `web` service:

* Builds the frontend web application from `frontend/Dockerfile` using the `dev` stage.
* Depends on a `api` service.
* Enables hot reloading:
  * Mounts the entire PostHub frontend source code (`frontend/`) to the container's `/app` directory.
  * Mounts the `node_modules` directory from the `deps` stage.
* Publishes container's port 5173 to the host machine so that the frontend web application can be accessed from outside the container.
* Defines environment variable `API_PROXY_TARGET=http://api:4000` to proxy API requests to the backend API server. We're in development mode, so the frontend web application is served by Vite development server, which proxies API requests to the backend API server.

#### `docker-compose.prod.yml`

* For production purposes.
* Defines two services: `api` and `web`.
    * `web` depends on `api`.
    * A `db` service is not defined because the production PostgreSQL database is managed by AWS RDS.

##### `api` service:

* Builds the backend API server from `backend/Dockerfile` using the `production` stage.
* Defines all necessary environment variables for the backend API server to work properly (database connection, cookie session secret, etc.).
* Doesn't mount any volumes for hot reloading because we're in production mode.
* Doesn't publish any ports to the host machine. Nginx reaches the backend API server at port 4000 via the internal Docker network.

##### `web` service:

* Builds the frontend web application from `frontend/Dockerfile` using the `production` stage.
* Publishes container's port 443 to the host machine so that the frontend web application can be accessed from outside the container.
* Doesn't mount any volumes for hot reloading because we're in production mode.
