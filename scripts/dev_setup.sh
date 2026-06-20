#!/usr/bin/env bash
# Prepare local development: generate a .env with dev defaults + secrets, and a TLS cert
# for willy.localhost + *.willy.localhost (mkcert -> browser-trusted; falls back to
# self-signed). Idempotent.
set -euo pipefail

ROOT="$(cd "$(dirname "${0}")/.." && pwd)"
cd "${ROOT}"

gen() {
  openssl rand -hex "${1:-32}"
}

if [ ! -f .env ]; then
  echo "Creating .env for local development..."

  postgres_password="$(gen 16)"

  cat > .env <<EOF
BASE_DOMAIN=willy.localhost
PANEL_HOST=willy.localhost

ACME_EMAIL=dev@willy.localhost
ACME_CA_SERVER=https://acme-staging-v02.api.letsencrypt.org/directory

OVH_ENDPOINT=ovh-eu
OVH_APPLICATION_KEY=
OVH_APPLICATION_SECRET=
OVH_CONSUMER_KEY=
OVH_PROPAGATION_TIMEOUT=120

WILLY_MASTER_KEY=$(gen 32)
JWT_SECRET=$(gen 32)
JWT_REFRESH_SECRET=$(gen 32)
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

POSTGRES_USER=willy
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_DB=willy
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
DATABASE_URL=postgresql://willy:${postgres_password}@postgres:5432/willy

REDIS_URL=redis://redis:6379

DOCKER_PROXY_HOST=docker-socket-proxy
DOCKER_PROXY_PORT=2375

BUILD_CONCURRENCY=2
RELEASE_KEEP_N=3
HEALTHCHECK_TIMEOUT=120
BUILDS_DIR=/var/willy/builds
BACKUPS_DIR=/var/willy/backups

WILLY_ADMIN_EMAIL=admin@willy.localhost
WILLY_ADMIN_PASSWORD=admin
EOF

  chmod 600 .env
else
  echo ".env already exists — leaving it untouched."
fi

mkdir -p routing/certs

# Each WEB deployment is served at <name>.willy.localhost, so the cert must carry the
# *.willy.localhost wildcard (a bare *.localhost only matches a single label). Regenerate an
# older cert that predates this so existing checkouts pick it up.
needs_cert=0

if [ ! -f routing/certs/local-cert.pem ]; then
  needs_cert=1
elif ! openssl x509 -in routing/certs/local-cert.pem -noout -text 2>/dev/null \
  | grep -qF "*.willy.localhost"; then
  echo "Local TLS cert is missing *.willy.localhost — regenerating."
  needs_cert=1
fi

if [ "${needs_cert}" -eq 1 ]; then
  if command -v mkcert >/dev/null 2>&1; then
    echo "Generating a browser-trusted cert with mkcert..."

    # Installing the local CA needs sudo; don't abort if it can't (e.g. non-interactive).
    # The cert still chains to the mkcert CA — re-run 'mkcert -install' to trust it.
    if ! mkcert -install; then
      echo "warning: could not install the local CA (needs sudo); run 'mkcert -install' to trust it."
    fi

    mkcert -cert-file routing/certs/local-cert.pem -key-file routing/certs/local-key.pem \
      "willy.localhost" "*.willy.localhost" "localhost" "*.localhost" 127.0.0.1 ::1
  else
    echo "mkcert not found — generating a self-signed cert (the browser will warn)."
    echo "Install mkcert for a trusted cert: https://github.com/FiloSottile/mkcert"

    openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout routing/certs/local-key.pem -out routing/certs/local-cert.pem \
      -subj "/CN=willy.localhost" \
      -addext "subjectAltName=DNS:willy.localhost,DNS:*.willy.localhost,DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"
  fi
else
  echo "Local TLS cert already present — leaving it untouched."
fi

echo "Local dev environment ready. Run 'make dev'."
