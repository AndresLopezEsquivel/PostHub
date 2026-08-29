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
