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
# git clones deployment source repos; nixpacks generates Dockerfiles for the Nixpacks
# build strategy (the image build itself still goes through the socket-proxy via dockerode).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl \
  && curl -sSL https://nixpacks.com/install.sh | bash \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
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
