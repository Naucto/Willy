# Build context = repo root (see docker-compose.yml).
# Debian (glibc) base so argon2's prebuilt native binding loads without compiling.
FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY backend ./backend
RUN npm run build --workspace @willy/backend

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# git clones deployment source repos; the docker CLI + compose plugin drive the Compose strategy
# (builds run on the legacy builder through the socket-proxy — DOCKER_HOST is set per-invocation).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl gnupg \
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
# Runtime write targets (the willy_backups / willy_logs volumes). chown to the non-root `node` user
# so a freshly-created named volume — which inherits the image mountpoint's ownership — is writable.
# The docker CLI talks to socket-proxy over TCP, so no host socket / docker group is needed.
RUN mkdir -p /var/lib/willy/backups /var/lib/willy/logs \
  && chown -R node:node /var/lib/willy
USER node
WORKDIR /app/backend
# Apply migrations (one-shot), then exec the server so it becomes PID 1 and receives SIGTERM directly.
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/main.js"]
