# Build context = repo root (see docker-compose.yml).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY backend ./backend
RUN npm run build --workspace @willy/backend

FROM node:24-alpine AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=build /app/backend/dist ./dist
# Phase 2 adds production deps + a HEALTHCHECK once the HTTP server exists.
CMD ["node", "dist/main.js"]
