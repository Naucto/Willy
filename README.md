# Willy 🐋

A self-hosted mini-PaaS. Point it at a fresh Debian VPS and deploy arbitrary git apps — web apps,
headless workers, and cron jobs — each on its own domain, with automatic Let's Encrypt certificates via
OVH, per-deployment environment variables, live logs and console, managed databases, and backups, all
from a web control panel.

> Rework of the former `Docker-Synchronizer`. The pre-rewrite history is preserved on the `pre-willy` tag.

## Status

Early development. See the master plan: [`docs/plans/14-06-2026-willy.md`](docs/plans/14-06-2026-willy.md).

## Quick start (local)

Requires Docker + `make` + [mkcert](https://github.com/FiloSottile/mkcert).

```sh
make dev
```

Opens the panel at `https://willy.localhost` with a locally-trusted certificate — no VPS, OVH, or public
DNS needed. Deploy apps to `*.localhost` subdomains.

## Quick start (a real VPS)

See the operator runbook in the [master plan](docs/plans/14-06-2026-willy.md#operator-runbook-the-almost-one-shot).
In short: create an OVH API token + a DNS record, then:

```sh
OVH_APPLICATION_KEY=… OVH_APPLICATION_SECRET=… OVH_CONSUMER_KEY=… \
  ./scripts/provision.sh --host <vps-ip> --base-domain willy.naucto.net --acme-email you@example.com …
```

## Contributing

Read [`AGENTS.md`](AGENTS.md) for layout, conventions, and the comment policy.

## License

See [`license.txt`](license.txt).
