# Security notes

Operational security guidance for Willy. See also the Security sections of `AGENTS.md` and the
master plan (`docs/plans/14-06-2026-willy.md`).

## Catastrophic-to-lose secrets

- `WILLY_MASTER_KEY` — encrypts every stored secret (env vars, webhook secrets, git credentials,
  backup destinations). Losing it makes all sealed data unrecoverable. Rotate with
  `npm run -w @willy/backend rotate-key -- <newKeyHex>` (re-encrypts everything; see `rotate-key.ts`).
- `routing/letsencrypt/acme.json` — the ACME cert store. Back both up off-host.

## Backup destination drivers

Offsite drivers (SSH/FTP/SFTP) run a throwaway helper container that ships the artifact to the
configured destination. All dynamic values (host, path, filename, credentials) are passed to the
helper **via environment variables referenced quoted in the shell command** — never interpolated
into the command string — so a hostile destination value cannot break out of the shell. As a second
layer, `BackupDestinationsService` rejects shell metacharacters in `host`/`path` at normalisation
time. S3 uses argv (no shell) and is unaffected. Keep this invariant if you add a driver.

## Control-plane container runs non-root

`willy-server` runs as the unprivileged `node` user. Its docker CLI reaches Docker through
socket-proxy over TCP, so no host socket mount or `docker` group is needed. Fresh `willy_backups` /
`willy_logs` named volumes inherit the image mountpoint's `node` ownership and are writable.

> Upgrade gotcha: a volume that already exists from a root-running container keeps its old root
> ownership (Docker only seeds ownership when a volume is first created). After upgrading, run once:
> `docker compose run --rm --user 0 willy-server chown -R node:node /var/lib/willy`.

## Dependency vulnerabilities — pending remediation

`npm audit` reports advisories on transitive deps whose parents pin them to **exact** versions, so
`npm audit fix` only offers destructive major downgrades and a direct dependency would not dedupe
them. The correct fix is npm `overrides`, which force-replace the pinned transitive versions. Apply
this in a standard npm environment (it regenerates the lockfile in the same step):

```jsonc
// package.json (root)
"overrides": {
  "multer": "^2.2.0",      // GHSA-72gw-mp4g-v24j, GHSA-3p4h-7m6x-2hcm (DoS) — via @nestjs/platform-express
  "js-yaml": "^4.2.0",     // GHSA-h67p-54hq-rp68 (quadratic DoS)          — via @nestjs/swagger
  "dompurify": "^3.4.11",  // mutation-XSS advisories                       — via monaco-editor
  "esbuild": ">=0.25.0"    // GHSA dev-server request smuggling (dev only)  — via drizzle-kit
}
```

Then run `npm install` to regenerate `package-lock.json` and commit both, and verify
`npm audit` is clean and the frontend still builds (Monaco bundles `dompurify`).

> Note: these overrides could not be applied/verified in the sandboxed dev environment used for the
> cleanup pass — its npm does not apply overrides to transitive deps nested under workspaces and
> rewrites the lockfile divergently, which would desync `npm ci` in CI/Docker. They are intentionally
> left for a standard npm environment so `main` is not pushed with an unverifiable lockfile.
> Re-check `monaco-editor`/`dompurify` on each bump: the editor is only fed trusted content here, so
> the residual is low-risk, but prefer the override once it is verified to keep the editor working.
>
> Re-verified 2026-06-25 (security audit, finding H1): npm 11.16.0 still ignores the root `overrides`
> for the workspace-nested `multer`/`esbuild` (it does not even record an `overrides` block in the
> regenerated lockfile). `multer` currently resolves to 2.1.1 — this already fixes CVE-2026-3520 but
> **not** CVE-2026-5038 / CVE-2026-5079, which need 2.2.0. Apply the block above and run `npm install`
> in a standard npm environment, then commit the regenerated lockfile.
