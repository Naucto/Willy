#!/bin/sh
# Willy remote provisioner (laptop-side). Turns a fresh Debian VPS into a running Willy host
# over SSH. Drives scripts/willy_deploy.sh on the target.
#
# Usage:
#   OVH_APPLICATION_KEY=.. OVH_APPLICATION_SECRET=.. OVH_CONSUMER_KEY=.. \
#     ./scripts/provision.sh --host <ip> --base-domain willy.example.com --acme-email you@example.com
#
# Verbs: provision (default) | upgrade | doctor | backup
set -eu

SCRIPT_DIR="$(cd "$(dirname "${0}")" && pwd)"

# --- Defaults ---
HOST=""
SSH_USER="root"
SSH_KEY=""
SSH_PORT="22"
BASE_DOMAIN=""
PANEL_SUBDOMAIN="panel"
ACME_EMAIL=""
OVH_ENDPOINT="ovh-eu"
ADMIN_EMAIL=""
REPO=""
REF="main"
CA=""
VERB="provision"

die() {
  printf 'error: %s\n' "${*}" >&2
  exit 1
}

log() {
  printf '>>> %s\n' "${*}"
}

usage() {
  cat >&2 <<EOF
Usage: ${0} [verb] [options]

Verbs:
  provision   (default) install + configure Willy on the target
  upgrade     pull the latest version and recreate changed services
  doctor      run read-only health checks on the target
  backup      stream .env, acme.json and a DB dump back to ./backups

Required (provision): --host, --base-domain, --acme-email, and the OVH_* env vars.

Options:
  --host <ip|name>           target SSH host
  --ssh-user <user>          SSH user with passwordless sudo (default: root)
  --ssh-key <path>           SSH private key (passed to ssh -i)
  --ssh-port <port>          SSH port (default: 22)
  --base-domain <domain>     panel base domain, e.g. willy.example.com
  --panel-subdomain <sub>    panel sub under base (default: panel; "" = apex)
  --acme-email <email>       Let's Encrypt account email
  --ovh-endpoint <ep>        OVH endpoint (default: ovh-eu)
  --admin-email <email>      bootstrap admin email
  --repo <url>               Willy git repo (default: project origin)
  --ref <ref>                git ref/branch (default: main)
  --ca staging|prod          ACME CA (default: staging first, auto-flip to prod)

Secrets via env only: OVH_APPLICATION_KEY, OVH_APPLICATION_SECRET, OVH_CONSUMER_KEY,
and optionally WILLY_ADMIN_PASSWORD (generated + printed once if absent).
EOF
  exit 1
}

# --- Parse args ---
case "${1:-}" in
  provision|upgrade|doctor|backup)
    VERB="${1}"
    shift
    ;;
esac

while [ ${#} -gt 0 ]; do
  case "${1}" in
    --host) HOST="${2}"; shift 2 ;;
    --ssh-user) SSH_USER="${2}"; shift 2 ;;
    --ssh-key) SSH_KEY="${2}"; shift 2 ;;
    --ssh-port) SSH_PORT="${2}"; shift 2 ;;
    --base-domain) BASE_DOMAIN="${2}"; shift 2 ;;
    --panel-subdomain) PANEL_SUBDOMAIN="${2}"; shift 2 ;;
    --acme-email) ACME_EMAIL="${2}"; shift 2 ;;
    --ovh-endpoint) OVH_ENDPOINT="${2}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2}"; shift 2 ;;
    --repo) REPO="${2}"; shift 2 ;;
    --ref) REF="${2}"; shift 2 ;;
    --ca) CA="${2}"; shift 2 ;;
    -h|--help) usage ;;
    *) die "unknown option '${1}' (see --help)" ;;
  esac
done

if [ -z "${HOST}" ]; then
  die "--host is required"
fi

# Panel host = apex when subdomain is empty, else <sub>.<base>.
PANEL_HOST=""
if [ -n "${BASE_DOMAIN}" ]; then
  if [ -n "${PANEL_SUBDOMAIN}" ]; then
    PANEL_HOST="${PANEL_SUBDOMAIN}.${BASE_DOMAIN}"
  else
    PANEL_HOST="${BASE_DOMAIN}"
  fi
fi

# --- SSH helpers ---
ssh_opts="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -p ${SSH_PORT}"
scp_opts="-P ${SSH_PORT} -q"
if [ -n "${SSH_KEY}" ]; then
  ssh_opts="${ssh_opts} -i ${SSH_KEY}"
  scp_opts="${scp_opts} -i ${SSH_KEY}"
fi
TARGET="${SSH_USER}@${HOST}"

# Word splitting of *_opts is intentional; commands run on the remote side.
# shellcheck disable=SC2086,SC2029
ssh_run() {
  ssh ${ssh_opts} "${TARGET}" "${@}"
}

preflight() {
  log "Preflight checks"

  command -v ssh >/dev/null 2>&1 || die "ssh not found"
  command -v scp >/dev/null 2>&1 || die "scp not found"

  ssh_run true 2>/dev/null || die "cannot SSH to ${TARGET} (check host, key, port, firewall)"
  ssh_run "sudo -n true" 2>/dev/null || die "passwordless sudo not available for ${SSH_USER} on ${HOST}"

  # shellcheck disable=SC2016  # must expand on the remote, not locally
  os_id="$(ssh_run '. /etc/os-release && echo "${ID} ${VERSION_ID}"' 2>/dev/null || true)"
  case "${os_id}" in
    debian\ *) log "Target OS: Debian ${os_id}" ;;
    *) printf 'warning: target is not Debian (%s); the deploy script targets Debian.\n' "${os_id}" >&2 ;;
  esac

  if [ "${VERB}" = "provision" ]; then
    if [ -z "${BASE_DOMAIN}" ]; then
      die "--base-domain is required for provision"
    fi

    if [ -z "${ACME_EMAIL}" ]; then
      die "--acme-email is required for provision"
    fi

    if [ -z "${OVH_APPLICATION_KEY:-}" ] || [ -z "${OVH_APPLICATION_SECRET:-}" ] || [ -z "${OVH_CONSUMER_KEY:-}" ]; then
      die "OVH_APPLICATION_KEY / OVH_APPLICATION_SECRET / OVH_CONSUMER_KEY env vars are required"
    fi

    # DNS sanity (best-effort): panel host should already point at the target.
    if command -v dig >/dev/null 2>&1; then
      resolved="$(dig +short "${PANEL_HOST}" A | tail -1 || true)"
      if [ -n "${resolved}" ] && [ "${resolved}" != "${HOST}" ]; then
        printf 'warning: %s resolves to %s, not %s — routing will fail until DNS is correct.\n' \
          "${PANEL_HOST}" "${resolved}" "${HOST}" >&2
      fi
    fi
  fi
}

# Build the remote env file content (export lines) consumed by willy_deploy.sh.
remote_env() {
  cat <<EOF
export BASE_DOMAIN='${BASE_DOMAIN}'
export PANEL_HOST='${PANEL_HOST}'
export ACME_EMAIL='${ACME_EMAIL}'
export OVH_ENDPOINT='${OVH_ENDPOINT}'
export OVH_APPLICATION_KEY='${OVH_APPLICATION_KEY:-}'
export OVH_APPLICATION_SECRET='${OVH_APPLICATION_SECRET:-}'
export OVH_CONSUMER_KEY='${OVH_CONSUMER_KEY:-}'
export WILLY_ADMIN_EMAIL='${ADMIN_EMAIL:-admin@${BASE_DOMAIN}}'
export WILLY_ADMIN_PASSWORD='${WILLY_ADMIN_PASSWORD:-}'
export WILLY_REF='${REF}'
EOF

  if [ -n "${REPO}" ]; then
    echo "export WILLY_REPO='${REPO}'"
  fi

  if [ -n "${CA}" ]; then
    echo "export ACME_CA='${CA}'"
  fi
}

run_remote_verb() {
  verb="${1}"

  log "Copying deploy script to ${HOST}"
  # shellcheck disable=SC2086  # scp_opts intentionally word-split
  scp ${scp_opts} "${SCRIPT_DIR}/willy_deploy.sh" "${TARGET}:/tmp/willy_deploy.sh"

  if [ "${verb}" = "provision" ] || [ "${verb}" = "upgrade" ]; then
    log "Sending configuration"
    remote_env | ssh_run "cat > /tmp/willy_provision.env && chmod 600 /tmp/willy_provision.env"

    log "Running '${verb}' on ${HOST} (this can take several minutes)"
    ssh_run "sudo sh -c '. /tmp/willy_provision.env && sh /tmp/willy_deploy.sh ${verb}; rm -f /tmp/willy_provision.env'"
  else
    ssh_run "sudo sh /tmp/willy_deploy.sh ${verb}"
  fi
}

cmd_backup() {
  ts="$(date +%Y-%m-%dT%H-%M-%S)"
  mkdir -p backups

  log "Streaming .env, acme.json and DB dump to ./backups"
  ssh_run "sudo cat /opt/willy/.env" > "backups/.env.${ts}"
  ssh_run "sudo cat /opt/willy/routing/letsencrypt/acme.json" > "backups/acme.${ts}.json" 2>/dev/null || true
  ssh_run "cd /opt/willy && sudo docker compose exec -T postgres pg_dump -U willy willy" | gzip > "backups/willy-db.${ts}.sql.gz"

  log "Backup written to ./backups (keep these safe — they include secrets)."
}

preflight

case "${VERB}" in
  provision|upgrade|doctor) run_remote_verb "${VERB}" ;;
  backup) cmd_backup ;;
esac

if [ "${VERB}" = "provision" ] && [ -n "${PANEL_HOST}" ]; then
  log "Done. Panel: https://${PANEL_HOST}"
fi

exit 0
