#!/bin/sh
# Willy host-side bootstrap. Normally invoked by scripts/provision.sh over SSH (under sudo),
# but standalone-runnable for debugging. Idempotent: safe to re-run.
#
# Verbs: provision (default) | upgrade | doctor | backup
#
# Configuration is read from the environment (provision.sh exports these):
#   BASE_DOMAIN PANEL_HOST ACME_EMAIL OVH_ENDPOINT OVH_APPLICATION_KEY
#   OVH_APPLICATION_SECRET OVH_CONSUMER_KEY WILLY_ADMIN_EMAIL [WILLY_ADMIN_PASSWORD]
#   [WILLY_REPO] [WILLY_REF] [ACME_CA=staging|prod]
set -eu

WILLY_DIR="/opt/willy"
WILLY_USER="willy"
WILLY_REPO="${WILLY_REPO:-https://github.com/Naucto/Willy.git}"
WILLY_REF="${WILLY_REF:-main}"
ACME_STAGING="https://acme-staging-v02.api.letsencrypt.org/directory"
ACME_PROD="https://acme-v02.api.letsencrypt.org/directory"

log() {
  printf '>>> %s\n' "${*}"
}

warn() {
  printf 'warning: %s\n' "${*}" >&2
}

die() {
  printf 'error: %s\n' "${*}" >&2
  exit 1
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "must run as root (use sudo)"
  fi
}

# Run a command as the willy service user in a fresh login shell (so the docker group applies).
as_willy() {
  su -l "${WILLY_USER}" -c "${*}"
}

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${1:-32}"
  else
    head -c "${1:-32}" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# Read a KEY=value from the existing .env (empty if absent).
env_get() {
  if [ -f "${WILLY_DIR}/.env" ]; then
    sed -n "s/^${1}=//p" "${WILLY_DIR}/.env" | head -1
  fi
}

install_packages() {
  log "Installing base packages"

  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg git ufw fail2ban \
    unattended-upgrades jq openssl >/dev/null
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker already installed"
    return
  fi

  log "Installing Docker Engine + compose plugin"

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  # shellcheck disable=SC1091  # /etc/os-release exists on the target at runtime
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  arch="$(dpkg --print-architecture)"
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian %s stable\n' \
    "${arch}" "${codename}" > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin >/dev/null

  systemctl enable --now docker >/dev/null 2>&1 || true
}

setup_user() {
  if ! id -u "${WILLY_USER}" >/dev/null 2>&1; then
    log "Creating service user '${WILLY_USER}'"
    useradd -m -s /bin/bash "${WILLY_USER}"
  fi

  usermod -aG docker "${WILLY_USER}"
}

setup_firewall() {
  log "Configuring ufw (allow 22/80/443)"

  ufw --force reset >/dev/null
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
}

harden_system() {
  log "Enabling unattended security upgrades + journald limits"

  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

  mkdir -p /etc/systemd/journald.conf.d
  cat > /etc/systemd/journald.conf.d/willy.conf <<'EOF'
[Journal]
SystemMaxUse=500M
EOF
  systemctl restart systemd-journald >/dev/null 2>&1 || true

  # Add a swap file if the box has none (helps builds on small RAM).
  if [ -z "$(swapon --show 2>/dev/null)" ] && [ ! -f /swapfile ]; then
    log "Creating 2G swap file"

    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile

    if ! grep -q '^/swapfile' /etc/fstab; then
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
  fi
}

install_deploy_key() {
  if [ -z "${WILLY_DEPLOY_KEY:-}" ]; then
    return
  fi

  log "Installing read-only deploy key for ${WILLY_USER}"

  ssh_dir="/home/${WILLY_USER}/.ssh"
  mkdir -p "${ssh_dir}"
  cp "${WILLY_DEPLOY_KEY}" "${ssh_dir}/id_ed25519"
  ssh-keyscan -t ed25519,rsa github.com > "${ssh_dir}/known_hosts" 2>/dev/null || true
  chmod 700 "${ssh_dir}"
  chmod 600 "${ssh_dir}/id_ed25519"
  chown -R "${WILLY_USER}:${WILLY_USER}" "${ssh_dir}"

  rm -f "${WILLY_DEPLOY_KEY}"
}

clone_or_update_repo() {
  if [ -d "${WILLY_DIR}/.git" ]; then
    log "Updating ${WILLY_DIR} to ${WILLY_REF}"
    as_willy "cd '${WILLY_DIR}' && git fetch --prune origin && git checkout '${WILLY_REF}' && git reset --hard 'origin/${WILLY_REF}'"
  else
    log "Cloning ${WILLY_REPO} to ${WILLY_DIR}"
    mkdir -p "${WILLY_DIR}"
    chown "${WILLY_USER}:${WILLY_USER}" "${WILLY_DIR}"
    as_willy "git clone --branch '${WILLY_REF}' '${WILLY_REPO}' '${WILLY_DIR}'"
  fi
}

write_env() {
  log "Writing ${WILLY_DIR}/.env (secrets preserved on re-run)"

  : "${BASE_DOMAIN:?BASE_DOMAIN is required}"
  : "${PANEL_HOST:=${BASE_DOMAIN}}"
  : "${ACME_EMAIL:?ACME_EMAIL is required}"

  # Preserve existing secrets; generate only when missing.
  master_key="$(env_get WILLY_MASTER_KEY)"
  if [ -z "${master_key}" ]; then
    master_key="$(gen_secret 32)"
  fi

  jwt_secret="$(env_get JWT_SECRET)"
  if [ -z "${jwt_secret}" ]; then
    jwt_secret="$(gen_secret 32)"
  fi

  jwt_refresh="$(env_get JWT_REFRESH_SECRET)"
  if [ -z "${jwt_refresh}" ]; then
    jwt_refresh="$(gen_secret 32)"
  fi

  pg_pass="$(env_get POSTGRES_PASSWORD)"
  if [ -z "${pg_pass}" ]; then
    pg_pass="$(gen_secret 16)"
  fi

  admin_pass="${WILLY_ADMIN_PASSWORD:-}"
  if [ -z "${admin_pass}" ]; then
    admin_pass="$(gen_secret 12)"
  fi

  tmp="${WILLY_DIR}/.env.tmp"
  cat > "${tmp}" <<EOF
BASE_DOMAIN=${BASE_DOMAIN}
PANEL_HOST=${PANEL_HOST}

ACME_EMAIL=${ACME_EMAIL}
ACME_CA_SERVER=${ACME_STAGING}

OVH_ENDPOINT=${OVH_ENDPOINT:-ovh-eu}
OVH_APPLICATION_KEY=${OVH_APPLICATION_KEY:-}
OVH_APPLICATION_SECRET=${OVH_APPLICATION_SECRET:-}
OVH_CONSUMER_KEY=${OVH_CONSUMER_KEY:-}
OVH_PROPAGATION_TIMEOUT=${OVH_PROPAGATION_TIMEOUT:-120}

WILLY_MASTER_KEY=${master_key}
JWT_SECRET=${jwt_secret}
JWT_REFRESH_SECRET=${jwt_refresh}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

POSTGRES_USER=willy
POSTGRES_PASSWORD=${pg_pass}
POSTGRES_DB=willy
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
DATABASE_URL=postgresql://willy:${pg_pass}@postgres:5432/willy

REDIS_URL=redis://redis:6379

DOCKER_PROXY_HOST=docker-socket-proxy
DOCKER_PROXY_PORT=2375

BUILD_CONCURRENCY=2
RELEASE_KEEP_N=3
HEALTHCHECK_TIMEOUT=120
BUILDS_DIR=/var/willy/builds
BACKUPS_DIR=/var/willy/backups

WILLY_ADMIN_EMAIL=${WILLY_ADMIN_EMAIL:-admin@${BASE_DOMAIN}}
WILLY_ADMIN_PASSWORD=${admin_pass}
EOF

  chmod 600 "${tmp}"
  chown "${WILLY_USER}:${WILLY_USER}" "${tmp}"
  mv "${tmp}" "${WILLY_DIR}/.env"
}

configure_traefik() {
  # Traefik does not expand env vars in its static file, so rewrite email + caServer here.
  # Re-applied every run (after git reset) to stay correct. Prod flip tracked by a marker.
  email="${ACME_EMAIL:-$(env_get ACME_EMAIL)}"
  if [ -z "${email}" ]; then
    die "ACME_EMAIL is not set and not found in .env"
  fi

  ca="${ACME_STAGING}"
  if [ -f "${WILLY_DIR}/.acme-prod" ]; then
    ca="${ACME_PROD}"
  fi

  if [ "${ACME_CA:-}" = "prod" ]; then
    ca="${ACME_PROD}"
    touch "${WILLY_DIR}/.acme-prod"
    chown "${WILLY_USER}:${WILLY_USER}" "${WILLY_DIR}/.acme-prod"
  fi

  f="${WILLY_DIR}/routing/traefik.yml"
  sed -i "s|email: \".*\"|email: \"${email}\"|" "${f}"
  sed -i "s|caServer: \".*\"|caServer: \"${ca}\"|" "${f}"
}

prepare_acme() {
  mkdir -p "${WILLY_DIR}/routing/letsencrypt"
  touch "${WILLY_DIR}/routing/letsencrypt/acme.json"
  chmod 600 "${WILLY_DIR}/routing/letsencrypt/acme.json"
  chown -R "${WILLY_USER}:${WILLY_USER}" "${WILLY_DIR}/routing/letsencrypt"
}

compose_up() {
  log "Building and starting the stack"
  as_willy "cd '${WILLY_DIR}' && docker compose pull --ignore-buildable && docker compose up -d --build"
}

wait_health() {
  log "Waiting for services to become healthy"

  i=0
  while [ "${i}" -lt 30 ]; do
    if as_willy "cd '${WILLY_DIR}' && docker compose ps --format '{{.Service}}:{{.Health}}'" | grep -q 'willy-server:healthy'; then
      log "Services healthy"
      return 0
    fi

    i=$((i + 1))
    sleep 4
  done

  warn "Timed out waiting for health; recent logs:"
  as_willy "cd '${WILLY_DIR}' && docker compose logs --tail=30 willy-server traefik" || true
}

acme_has_cert() {
  jq -e '[.. | objects | select(has("Certificates")) | .Certificates | length] | add // 0 | . > 0' \
    "${WILLY_DIR}/routing/letsencrypt/acme.json" >/dev/null 2>&1
}

issue_cert() {
  log "Waiting for the Let's Encrypt (staging) certificate via OVH DNS-01"

  i=0
  while [ "${i}" -lt 30 ]; do
    if acme_has_cert; then
      log "Staging certificate obtained"
      break
    fi

    i=$((i + 1))
    sleep 6
  done

  if ! acme_has_cert; then
    warn "No certificate yet — check OVH credentials/DNS and 'docker compose logs traefik'."
    return 0
  fi

  if [ ! -f "${WILLY_DIR}/.acme-prod" ]; then
    log "Flipping ACME to production and re-issuing"

    : > "${WILLY_DIR}/routing/letsencrypt/acme.json"
    chmod 600 "${WILLY_DIR}/routing/letsencrypt/acme.json"
    touch "${WILLY_DIR}/.acme-prod"
    chown "${WILLY_USER}:${WILLY_USER}" "${WILLY_DIR}/.acme-prod"

    configure_traefik
    as_willy "cd '${WILLY_DIR}' && docker compose up -d --force-recreate traefik"

    i=0
    while [ "${i}" -lt 30 ]; do
      if acme_has_cert; then
        break
      fi

      i=$((i + 1))
      sleep 6
    done
  fi

  issuer="$(echo | openssl s_client -connect "127.0.0.1:443" -servername "${PANEL_HOST}" 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null || true)"
  log "Served certificate issuer: ${issuer:-unknown}"
}

cmd_provision() {
  require_root
  install_packages
  install_docker
  setup_user
  install_deploy_key
  setup_firewall
  harden_system
  clone_or_update_repo
  write_env
  configure_traefik
  prepare_acme
  compose_up
  wait_health
  issue_cert
  log "Willy is provisioned. Panel: https://${PANEL_HOST}"
}

cmd_upgrade() {
  require_root

  if [ ! -d "${WILLY_DIR}/.git" ]; then
    die "Willy is not installed at ${WILLY_DIR}"
  fi

  install_deploy_key
  clone_or_update_repo
  configure_traefik
  prepare_acme

  log "Pulling images and recreating changed services"
  as_willy "cd '${WILLY_DIR}' && docker compose pull --ignore-buildable && docker compose up -d --build --remove-orphans"

  wait_health
  log "Upgrade complete."
}

check() {
  # check "<label>" <status: 0 ok / non-zero fail> ; sets rc=1 on failure
  if [ "${2}" -eq 0 ]; then
    echo "  [ok] ${1}"
  else
    echo "  [!!] ${1}"
    rc=1
  fi
}

cmd_doctor() {
  rc=0
  echo "Willy doctor:"

  command -v docker >/dev/null 2>&1
  check "docker installed" "${?}"

  if [ -f "${WILLY_DIR}/.env" ]; then
    [ "$(stat -c '%a' "${WILLY_DIR}/.env")" = "600" ]
    check ".env present (600)" "${?}"
  else
    check ".env present" 1
  fi

  if [ -f "${WILLY_DIR}/routing/letsencrypt/acme.json" ]; then
    [ "$(stat -c '%a' "${WILLY_DIR}/routing/letsencrypt/acme.json")" = "600" ]
    check "acme.json present (600)" "${?}"

    if acme_has_cert; then
      echo "  [ok] certificate present"
    else
      echo "  [..] no certificate yet"
    fi
  else
    echo "  [..] acme.json not created yet"
  fi

  if [ -d "${WILLY_DIR}/.git" ]; then
    as_willy "cd '${WILLY_DIR}' && docker compose ps --format '  {{.Service}}: {{.State}} {{.Health}}'" 2>/dev/null || true
  fi

  df -Pk / | awk 'NR==2 {avail=$4/1024/1024; printf "  [%s] disk: %.1fG free\n", (avail<5?"!!":"ok"), avail}'
  return "${rc}"
}

cmd_backup() {
  require_root

  ts="$(date +%Y-%m-%dT%H-%M-%S)"
  out="${WILLY_DIR}/backups/host"
  mkdir -p "${out}"

  log "Backing up .env, acme.json and the metadata DB to ${out}"
  cp -a "${WILLY_DIR}/.env" "${out}/.env.${ts}"
  cp -a "${WILLY_DIR}/routing/letsencrypt/acme.json" "${out}/acme.${ts}.json" 2>/dev/null || true
  as_willy "cd '${WILLY_DIR}' && docker compose exec -T postgres pg_dump -U willy willy" | gzip > "${out}/willy-db.${ts}.sql.gz"

  log "Backup written. Copy ${out} off the host and keep WILLY_MASTER_KEY safe."
}

verb="${1:-provision}"
case "${verb}" in
  provision) cmd_provision ;;
  upgrade)   cmd_upgrade ;;
  doctor)    cmd_doctor ;;
  backup)    cmd_backup ;;
  *) die "unknown verb '${verb}' (use: provision | upgrade | doctor | backup)" ;;
esac
