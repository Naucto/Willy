# Architecture

Willy is a single-host mini-PaaS. The authoritative design — components, data model, deployment
lifecycle, TLS/DNS, security, and the phased roadmap — lives in the master plan:
[`plans/14-06-2026-willy.md`](plans/14-06-2026-willy.md).

This document will grow with ADRs and subsystem deep-dives as phases land. High level:

- **Traefik** (edge) routes each WEB deployment by `Host` rule on the `willy_edge` network and obtains
  Let's Encrypt certs via OVH DNS-01.
- **willy-server** (NestJS) is the control plane: it builds git repos (Nixpacks / Dockerfile / compose),
  runs containers through `dockerode` (via a least-privilege docker-socket-proxy), manages env vars,
  domains/DNS, managed databases, backups, and streams logs/console.
- **willy-web** (React + MUI) is the control panel.
- **PostgreSQL** holds Willy's own metadata (Drizzle schema).

Deployment types: **WEB** (domain + router), **WORKER** (no domain), **CRON** (scheduled).
