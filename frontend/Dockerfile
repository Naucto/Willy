# Build context = repo root (see docker-compose.yml).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY frontend ./frontend
RUN npm run build --workspace @willy/frontend

FROM nginx:alpine AS runtime
COPY --from=build /app/frontend/dist /usr/share/nginx/html
# Phase 4 adds the SPA-fallback nginx config.
EXPOSE 80
