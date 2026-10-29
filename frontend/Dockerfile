# Node 22, while the backend uses Node 20: Vite 8 requires Node 20.19+ or 22.12+.
# The production image ships no Node, so the two versions never need to match.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# The production image has no Node: the build outputs static files, and nginx
# serves them and proxies /api to the backend (see nginx.conf).
FROM nginx:alpine AS production
# Overwrites the nginx image's default server config.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
