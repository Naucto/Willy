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
# strategy; the docker CLI + compose plugin drive the Compose strategy (builds run on the
# legacy builder through the socket-proxy — DOCKER_HOST is set per-invocation).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl gnupg \
  && curl -sSL https://nixpacks.com/install.sh | bash \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/drizzle ./backend/drizzle
# Surfaced on the login screen via /api/system/info.
ARG GIT_COMMIT=dev
ENV GIT_COMMIT=$GIT_COMMIT
WORKDIR /app/backend
# Apply migrations (one-shot) before starting the server.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
