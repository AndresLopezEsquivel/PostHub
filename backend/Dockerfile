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
EXPOSE 4000
CMD ["node", "dist/server.js"]
