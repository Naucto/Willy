# Build context = repo root (see docker-compose.yml).
# Debian (glibc) base so argon2's prebuilt native binding loads without compiling.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY backend ./backend
RUN npm run build --workspace @willy/backend

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# git is needed at runtime to clone deployment source repos.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/drizzle ./backend/drizzle
WORKDIR /app/backend
# Apply migrations (one-shot) before starting the server.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
