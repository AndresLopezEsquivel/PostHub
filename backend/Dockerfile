# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- dev (used by docker-compose for local development) ----
FROM deps AS dev
WORKDIR /app
COPY . .
CMD ["npm", "run", "dev"]

# ---- build ----
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# ---- production ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Ship the raw .sql alongside dist so the migration runner has files to apply
# when it runs as a deploy step against a managed database (e.g. RDS).
COPY migrations ./migrations
EXPOSE 4000
CMD ["node", "dist/server.js"]
