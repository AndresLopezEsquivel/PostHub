FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS dev
WORKDIR /app
COPY . .
CMD ["npm", "run", "dev"]

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# tsc only compiles src/ into dist/, so the SQL files need their own copy.
# The compiled runner (dist/db/migrate.js) reads them from /app/migrations.
COPY migrations ./migrations
EXPOSE 4000
CMD ["node", "dist/server.js"]
