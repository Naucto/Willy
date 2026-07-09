# Architecture

Willy is a single-host mini-PaaS. The authoritative design — components, data model, deployment
lifecycle, TLS/DNS, security, and the phased roadmap — lives in the master plan:
[`plans/14-06-2026-willy.md`](plans/14-06-2026-willy.md).

This document will grow with ADRs and subsystem deep-dives as phases land. High level:

- **Traefik** (edge) routes each WEB deployment by `Host` rule on the `willy_edge` network and obtains
  Let's Encrypt certs via OVH DNS-01.
- **willy-server** (NestJS) is the control plane: it builds git repos (Dockerfile / compose) or runs prebuilt images,
  runs containers through `dockerode` (via a least-privilege docker-socket-proxy), manages env vars,
  domains/DNS, managed databases, backups, and streams logs/console.
- **willy-web** (React + MUI) is the control panel.
- **PostgreSQL** holds Willy's own metadata (Drizzle schema).

Deployment types: **WEB** (domain + router), **WORKER** (no domain), **CRON** (scheduled).

## Deploy health gate

Every WEB deploy is gated on the app becoming healthy **and** actually accepting connections on its
routed port before traffic cuts over — a healthy container that listens on the wrong port would
otherwise silently 502. The wait budget is **per-deployment** (`healthTimeoutSec`, set in Settings),
falling back to the operator-wide `HEALTHCHECK_TIMEOUT` env (seconds), then a built-in 90s. Raise it for
slow-booting apps (migrations, JIT warmup). It governs both the healthy-wait and the reachability probe
(`backend/src/build/health-prober.service.ts`).

## Compose deploys (blue-green)

A compose deploy never takes the running app down, even on failure. The stack's services are classified
(`classifyComposeServices`, `compose.service.ts`):

- **Pinned** — hold exclusive state (a writable named volume, a host bind mount, `network_mode: host`,
  `privileged`, `devices`, or membership in a non-default network). They stay singletons under the
  **base project** `willy_<name>`, so their volumes keep the name `willy_<name>_<vol>` forever (no data
  loss, no backup-target churn). Recreated in place — a brief blip if their definition changed.
- **Eligible** — safe to run two copies at once (no exclusive state). They are brought up under a
  **release-scoped project** `willy_<name>_r<release>` alongside the currently-serving one, health-checked
  in isolation, then cut over by Traefik router **priority** (the new release launches at a lower
  priority, so the old one keeps serving until it is torn down). On a failed gate, only the new
  (green) release project is removed; base + the prior release keep serving (deployment → `DEGRADED`).

Eligible services reach pinned singletons (e.g. a DB) by compose DNS over an external link to the base
project's default network; the DB is a shared singleton both app versions connect to — never duplicated,
its volume never double-mounted. All of a deployment's containers carry the `willy.deploymentId` owner
label, so discovery/admin/logs/stats span both projects.

**Limitations (v1):** stacks with a service on a non-default network deploy fully in-place (no
blue-green); host-port services (e.g. WebRTC) are pinned, so only the stateless tier gets zero-downtime;
a non-backward-compatible migration breaks the cutover overlap window (standard zero-downtime discipline,
on the app author); compose rollback is a re-deploy of the target commit, and pinned-service data is
never rolled back.
