# Mirrors backend/Dockerfile's four-stage shape (deps → dev → build → production)
# with one deliberate difference: the production stage contains no Node at all. A
# built SPA is static files, so nginx serves them directly and also owns the /api
# reverse proxy (see nginx.conf).
#
# node:22-alpine, where the backend is on node:20-alpine: current Vite and Vitest
# want Node >=20.19/>=22.12 and the margin on 20 is thin. The two images share no
# runtime, and this one is build-time tooling that ships nothing, so the skew is
# harmless.

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- dev (used by docker-compose for local development) ----
FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---- build ----
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# ---- production ----
FROM nginx:alpine AS production
# Replaces the base image's default server block.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
