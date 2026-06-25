# Willy security audit — 2026-06-25

A complete security review of the Willy control plane (NestJS), dashboard (React), and edge/orchestration
config. Conducted against the [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/) and current
CVE data.

## Scope & threat model

Willy is **single-team, self-hosted**. Every authenticated user is a trusted operator
(`ADMIN` / `OPERATOR` / `VIEWER`). The only internet-facing surface is Traefik; the control plane reaches
Docker exclusively through `docker-socket-proxy`. Severities below reflect *this* model — issues that would
be Critical in a multi-tenant SaaS are often Medium here because the actors are trusted.

## Headline

Fundamentals are strong. **No confirmed RCE or privilege-escalation path was found.** The gaps are
defense-in-depth: HTTP hardening headers, an unapplied dependency-patch set, container-capability
hardening, and webhook-replay / console-ticket scoping.

## What is done well (verified)

- **Secrets at rest:** AES-256-GCM (authenticated) with a random 96-bit nonce per encryption and a key
  version for rotation — `crypto/crypto.service.ts`, plus a working re-encryption tool (`rotate-key.ts`).
  Covers env vars, webhook secrets, git credentials, backup destinations, and the TOTP secret.
- **Passwords:** Argon2id (`auth/auth.service.ts`). Refresh tokens hashed and rotated; cleared on password
  change and on account disable.
- **Timing-safe comparisons** everywhere they matter: webhook HMAC (`webhooks.service.ts`), console
  tickets (`console.service.ts`).
- **Least-privilege Docker:** raw socket mounted read-only into `docker-socket-proxy` only; backend talks
  TCP to the proxy with a restricted API allowlist (`docker-compose.yml`). Control plane runs as non-root.
- **Network segmentation:** `willy_edge` (Traefik + web apps) vs `willy_internal` (db/redis/proxy/helpers).
- **Input validation:** global `ValidationPipe { whitelist, forbidNonWhitelisted, transform }`
  (`main.ts`) — blocks mass-assignment.
- **No SQL injection:** Drizzle parameterized queries throughout; the only `sql\`\`` uses are static
  (`select 1`, `now()`).
- **No shell injection:** subprocesses use `execFile`/`spawn` with array args (git clone, tar, docker
  compose); backup drivers pass all dynamic values via env vars, with a metacharacter-rejecting validator
  as a second layer (`backups/destinations.service.ts`).
- **Path traversal defended:** `files/file-path.ts` rejects `..`, null bytes, over-long paths; a post-
  resolution `realpath` check blocks symlink escape (`files/files.service.ts`).
- **Frontend XSS-safe:** no `dangerouslySetInnerHTML`/`eval`; ANSI logs rendered via `anser` into React-
  escaped spans with only color/decoration styles applied.
- **Audit logging** of sensitive actions without recording secrets.

## Findings

Severities reflect the threat model above.

### HIGH

**H1 — Documented npm `overrides` were never applied.**
`docs/security.md` prescribes `overrides` for vulnerable transitive deps, but root `package.json` had no
`overrides` block. Current advisories:
- `multer` DoS — CVE-2026-5038 (incomplete cleanup of aborted uploads), CVE-2026-5079 (deeply nested field
  names), CVE-2026-3520 (uncontrolled recursion) — fixed in **2.2.0**; pulled in by
  `@nestjs/platform-express` and **reachable from the file-upload endpoint**.
- `js-yaml` quadratic-complexity DoS (via `@nestjs/swagger`).
- `dompurify` mutation-XSS (via `monaco-editor`; editor is fed trusted content, so residual is low).
- `esbuild` dev-server request smuggling (dev-only, via `drizzle-kit`).
*Refs:* [Vulnerable Dependency Management](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html),
[Node.js Security](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html).
**Fix:** apply the `overrides`, regenerate the lockfile, confirm `npm audit` clean + frontend builds.

### MEDIUM

**M1 — CSP gap for Monaco workers (headers otherwise present at the edge).**
*Correction to the initial backend-only review:* the panel's hardening headers are **not** absent — they
are set by Traefik's `panel-sec-headers` middleware (`routing/dynamic/middlewares.yml`), applied to both
`willy-web` (the HTML document) and `willy-api`. HSTS, `X-Content-Type-Options`, `frameDeny`,
referrer-policy, and a strict CSP are all in place — and the edge is the *correct* layer for them (a
NestJS Helmet would only cover API JSON, not the HTML document, and would double-set headers). The real
gap: the CSP had no `worker-src`, so Monaco's Vite-bundled (blob:) workers fall back to `default-src
'self'`, which forbids `blob:` — the file editor breaks under CSP in dev/inline-worker mode. CSP matters
here because tokens live in `localStorage`, so any XSS is a token-theft. *Ref:*
[HTTP Security Response Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html),
[CSP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).
**Fix (applied):** add `worker-src 'self' blob:` (+ explicit `script-src 'self'`, `form-action 'self'`)
to the `panel-sec-headers` CSP; add a Playwright assertion that the headers ship on the document.

**M2 — Container capabilities unhardened.** `docker/docker-container.service.ts` passed
`CapAdd`/`CapDrop` through verbatim, with no `no-new-privileges` and no `cap-drop ALL` baseline; a
deployment could request `SYS_ADMIN`, `SYS_PTRACE`, `NET_ADMIN`, etc. *Ref:*
[Docker Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html) —
always set `no-new-privileges`; restrict added capabilities.
**Fix (applied):** `no-new-privileges:true` baseline on both the single-container path
(`docker-container.service.ts`, via `SecurityOpt`) and every compose service
(`sanitizeComposeYaml`, appended to any user `security_opt`), plus a dangerous-capability denylist
(`deployments/capabilities.ts`) enforced on `capAdd` across all deployment DTOs. Note: Docker's *default*
cap set already excludes the dangerous caps, so a blanket `cap-drop ALL` is deliberately **not** applied —
it would break ordinary images that need `CHOWN`/`SETUID`/`SETGID`/`NET_BIND_SERVICE` at startup; the
denylist closes the actual hole (an explicit `capAdd` re-granting them). Behavior change to verify against
live deployments: any app relying on setuid escalation at runtime will need an explicit opt-out (none
exists yet — add a per-deployment flag if one surfaces).

**M3 — Webhook replay.** `webhooks.service.ts` verifies the HMAC (timing-safe — good) but ignores
`X-GitHub-Delivery`; a captured payload can be replayed to re-trigger deploys (resource-exhaustion DoS).
*Ref:* [REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).
**Fix:** persist processed delivery IDs and reject duplicates before deploying.

**M4 — Console WS ticket not scoped to a deployment.** The ticket payload is only `{sub, exp}`
(`console.service.ts`); any operator-issued ticket can `attach()` to any `deploymentId` in the URL, and
there is no per-deployment authorization. Acceptable under "all operators trusted" today, but a latent
IDOR the moment per-deployment ACLs are introduced. *Ref:*
[Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
[IDOR Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html).
**Fix:** bind `deploymentId` into the ticket and check it on attach.

**M5 — 2FA brute-force / lockout.** `auth.controller.ts` throttles `2fa/login` at 10/5min **per IP**, but
there is no per-account lockout or per-challenge-token attempt cap, and challenge/setup tokens are reusable
within their TTL — a 6-digit TOTP is brute-forceable across rotating IPs. *Ref:*
[Multifactor Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html),
[Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
**Fix:** per-account failed-attempt counter with temporary lockout + per-token attempt cap.

### LOW / INFO

- **L1 — No explicit CORS policy.** `main.ts` never calls `enableCors`. *Assessed: no change needed* —
  `willy-web` and `willy-api` share one origin (`PANEL_HOST`), auth is a Bearer header (no ambient cookie),
  and the framework default emits no `Access-Control-Allow-Origin`, so cross-origin browser calls are
  already denied. Enabling CORS would only widen the surface. Documented as an intentional non-action.
- **L2 — No global exception filter.** Only `FileManagerExceptionFilter` exists; unhandled errors may leak
  stack traces in production. Add a global filter that redacts in prod.
- **L3 — Env-var key/value unbounded** (`env-vars/env-vars.service.ts`). The env-var **name** was an
  unvalidated path param that flows into Docker `KEY=value` entries and compose `${KEY}` interpolation.
  **Fix (applied):** `env-vars/env-var-validation.ts` enforces a conventional identifier for the key and
  rejects NUL bytes / oversized values for the value — deliberately *not* rejecting newlines, since
  multiline secrets (PEM keys, JSON) are legitimate and compose interpolation substitutes into scalar
  values (no YAML-structure breakout).
- **L4 — Domain validation.** *Assessed: already handled* — `AddDomainDto.fqdn` uses
  `@IsFQDN({ require_tld: true })`, custom domains must pass OVH DNS-01 ownership proof, and Traefik
  routes by `Host` rule. `*.localhost` is intentionally allowed for local dev, so reject-internal-names
  was deliberately **not** added (it would break `make dev`). No change.
- **I1 — `localStorage` tokens** (`frontend/src/api/tokens.ts`). Acknowledged trade-off for an internal
  ops panel; mitigated by refresh rotation. CSP (M1) is the real compensating control. Accepted risk.

## Verified and dismissed (do not "fix")

- **Deployments `list()` "missing `@Roles`":** false positive — NestJS class-level
  `@Roles("ADMIN","OPERATOR")` applies to non-overriding methods, so the endpoint *is* guarded.
- **TOTP `window:1` "too permissive":** standard and RFC-6238-compliant (±1 step). Not a finding.
- **CSRF:** not applicable — Bearer-token-in-header API, no ambient cookie credentials.

## Remediation status

All findings (H1 → L4) are being remediated in the same change set, each with tests, per the repo's
"tests ship with the change" rule. I1 is documented as an accepted risk with CSP as the compensating
control.

## Sources

- OWASP Cheat Sheet Series — https://cheatsheetseries.owasp.org/
- multer advisories — CVE-2026-5038, CVE-2026-5079, CVE-2026-3520 (fixed in 2.2.0)
