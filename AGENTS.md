# AGENTS.md — Willy

Willy is a self-hosted mini-PaaS: it deploys arbitrary git apps (web apps, headless workers, cron jobs)
to a single Docker host, each routed to its own domain via Traefik with automatic Let's Encrypt
certificates through OVH, with per-deployment env vars, logs, console, managed databases, and backups —
all driven from a web control panel.

This file is the source of truth for humans and coding agents. `CLAUDE.md` is a symlink to it.

## Repository layout

```
backend/    NestJS + Drizzle control plane (REST/WS API, Docker orchestration via dockerode)
frontend/   React + Vite + MUI dashboard
routing/    Traefik static + dynamic config
scripts/    provision.sh (laptop) + willy_deploy.sh (host) remote provisioner
docs/       architecture, runbooks; docs/plans/ holds every dev plan (dd-mm-yyyy-title.md)
```

The full master plan with all decisions, the data model, and the phased roadmap lives in
[`docs/plans/14-06-2026-willy.md`](docs/plans/14-06-2026-willy.md). Read it before non-trivial work.

## Stack

- **Runtime:** Node 24 LTS. **Package manager:** npm workspaces (`backend`, `frontend`).
- **Backend:** NestJS 11, Drizzle ORM + PostgreSQL, dockerode (via docker-socket-proxy), raw `ws` for
  streaming console/logs.
- **Frontend:** Vite + React 19 + TypeScript + MUI 9 + TanStack Query.
- **Edge:** Traefik v3.7 (ACME DNS-01 via OVH).
- **Tooling:** Biome (lint+format), strict `tsc`, Vitest (unit/integration) + Testcontainers, Playwright
  (e2e), lefthook (pre-commit), GitHub Actions (CI).

## Common commands

```
make dev        # full stack locally at https://willy.localhost (mkcert certs, no OVH/DNS)
make test       # Vitest across workspaces
make lint       # Biome check
make typecheck  # tsc --noEmit across workspaces
make e2e        # Playwright against the local stack
```

## Conventions

- **Comments: explain the _why_, not the _how_.** Keep them short, or omit them — if the code is
  obvious, no comment; if the logic is ambiguous, a few lines on the reasoning or trade-off. Never narrate
  what the code plainly does.
- **TypeScript is strict** (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`). **`any` is banned** (Biome enforces `noExplicitAny`); reach for `unknown` only
  sparingly (narrow it immediately). Type everything where it matters — public functions, DTOs, returns.
- **Throw `Error`-extended classes, never bare `Error`.** Each app has a base (`backend/src/common/errors.ts`,
  `frontend/src/errors.ts`); derive specific named errors from it so failures are typed and catchable.
- **Aerate the code.** Add a blank line after a block (e.g. after an `if {…}`) before the following
  statements; group logically. Readability over density.
- **Shell scripts (POSIX `sh`):** always brace variables (`${var}`, never bare `$var`); never write an
  inline `if … then … fi` — unfold into multi-line blocks; aerate (blank lines between logical groups);
  filenames use `under_scores.sh`. Keep them shellcheck-clean (CI runs `shellcheck scripts/*.sh`).
- **Match surrounding style.** Biome formats; don't hand-fight it.
- **Backend exposes DTOs** (class-validator) as the API contract; **the frontend never hand-writes API
  types** — it consumes a client generated from the backend's OpenAPI spec.
- **Commit format: `[AREA] [ACTION] What it does`** (enforced by the commit-msg hook). `AREA` is the part
  of the project (`DOCKER`, `BACKEND`, `FRONTEND`, `ROUTING`, `META`, …); `ACTION` is usually `ADD`,
  `FIX`, `UPDATE`, `CLEAN`, `REMOVE` (freeform if none fit). E.g. `[BACKEND] [ADD] Health endpoint`.
  Branch off `main`.
- **Tests ship with the change** — every feature/bugfix in the same PR; CI must be green to merge.
- **Secrets never logged or returned in plaintext.** Env-var values are encrypted at rest and decrypted
  only at container-injection time.

## Security notes

- The control plane talks to Docker only through **docker-socket-proxy** (least privilege) — never mount
  the raw socket into app-facing services.
- `WILLY_MASTER_KEY` (encrypts stored secrets) and `routing/letsencrypt/acme.json` (cert store) are
  catastrophic to lose — back both up.
- Webhooks are HMAC-verified; OVH tokens are zone-scoped. See the plan's Security section.
