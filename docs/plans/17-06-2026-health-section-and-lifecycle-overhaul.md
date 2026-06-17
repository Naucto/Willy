# Lifecycle UX, source/compose overhaul & new Health section

> Dev plan — 17-06-2026. Status: implemented (all 4 phases shipped to main).

## Context
A new development cycle covering several deployment-page fixes plus two large refactors the user
explicitly opted into:
- **Dissolve the central "compose web service"** concept. There is no single anchor container; the
  field is removed from the source UI, `release.containerId` becomes optional, and console/logs
  resolve a container explicitly (defaulting to the sole one). Admin tracking already pivots on the
  compose-project/owner label.
- **A new "Health" deployment section** that shows *declared* Docker/compose healthchecks read-only,
  lets users define *custom* healthchecks (test/interval/timeout/retries) per container, and owns the
  restart policy (global + per-container) — moved out of Resources. `healthCheckPath` moves here too.

Work is grouped into 4 phases, each independently shippable. Backend changes require regenerating the
OpenAPI client (per `willy-api-generation` memory). Tests ship with each phase; `make lint`,
`typecheck`, `test` must stay green.

---

## Phase 1 — Quick, independent fixes

### 1a. Git token above Git ref
`frontend/src/components/source/GitRepoFields.tsx`: render order becomes **Git URL → Git token (if
`showToken`) → Git ref**. Token-before-ref also means the token is present before branch discovery
runs (discovery already uses `value.gitToken`).

### 1b. Git ref turns red when the branch doesn't exist on the remote
Reuse the existing discovery path (`GitService.listBranches` → `git ls-remote`, `POST /git/branches`,
`useDiscoverBranches`).
- **Backend** `backend/src/git/git.service.ts` `listBranches`: extend to `git ls-remote --heads --tags`
  and parse both `refs/heads/` and `refs/tags/` (drop peeled `^{}` entries) so tags don't false-flag.
- **Frontend** `GitRepoFields.tsx`: once branches are loaded for the current URL
  (`branchesLoadedFor === raw`) and non-empty, if `value.gitRef` is non-empty and not in the list, set
  the ref `TextField`'s `error` + helperText ("This ref wasn't found on the remote."). Non-blocking
  (visual only) — discovery can legitimately miss refs and the user may push later.

### 1c. Delete redirects instead of "failed to fetch"
Root cause (`frontend/src/api/hooks.ts` `useRemoveDeployment`): `onSuccess` only invalidates the list,
so the detail page's `useDeployment(id)` (`refetchInterval: 5000`) refetches the deleted id → 404 →
the detail error Alert.
- `useRemoveDeployment` `onSuccess(_d, id)`: `queryClient.removeQueries({ queryKey: queryKeys.deployment(id) })`
  (prefix removes detail + `containers`/`releases`/`domains` sub-queries, stopping the 404 refetch),
  then `invalidateQueries({ queryKey: queryKeys.deployments })`.
- `DeployActions.tsx` already calls `onDeleted` → `navigate("/deployments")`; keep.

### 1d. Humanized state + transient states + block nav while deleting
- **`frontend/src/components/StatusBadge.tsx`**: map each state to a humanized label + color instead of
  rendering the raw enum. Add synthetic transient states `DELETING` (error), `STOPPING` (warning),
  `RESTARTING`/`STARTING` (info) alongside humanized `RUNNING`→"Running", `DEPLOYING`→"Deploying", etc.
- **Transient propagation across components**: give the lifecycle mutations stable `mutationKey`s
  (`["deployment-action", id, <action>]`) in `hooks.ts` (`useDeploy/useRestart/useStop/useStart/useRemoveDeployment`).
  Add `useDeploymentTransition(id)` reading `useMutationState` → returns the synthetic label while a
  lifecycle mutation for that id is pending (delete is synchronous on the backend, so its `isPending`
  spans the whole teardown — good signal).
- **`DeploymentsPage.tsx`**: render `transition ?? deployment.state` in the badge; when transition is
  `DELETING`, disable the row's `onClick` navigation and dim the row.
- **`DeploymentDetailPage.tsx`** header badge: same `transition ?? state`.

---

## Phase 2 — Compose pipeline: sanitize file + dissolve the web-service anchor

### 2a. Sanitize the user's compose file (fixes the `container_name` conflict bug)
The bug: a compose file with `container_name: pastebin` collides across deployments because
`container_name` overrides the project prefix and override files can't *delete* keys.
- **`backend/src/build/strategies/compose.service.ts`**: before `up`, add `sanitizeComposeFile(dir, composeFilePath)`
  that reads the file (the `yaml` dep — `import { parse, stringify }`), **strips `container_name` from
  every service** and the obsolete top-level `version`, returns the ordered `services` list + declared
  `healthcheck` blocks, and **writes the sanitized YAML back to the same path** (the clone dir is
  ephemeral, so in-place rewrite keeps all relative build contexts valid). Containers then get Docker's
  project-prefixed names (`willy_<name>-<service>-N`) — unique per deployment.
- Unit-test the pure parse/strip helper (extract it so it takes a yaml string → `{ yaml, services, healthchecks }`).

### 2b. Dissolve the single "web service" anchor
Remove the user-facing field and the single-anchor assumption.
- **Frontend**: delete the "Compose web service" `TextField` from
  `frontend/src/components/source/ComposeSourceFields.tsx`; stop sending `composeWebService` from
  `CreateDeploymentPage.tsx` and `SettingsTab.tsx`. (`SourceValue.composeWebService` may stay unused.)
- **Backend DTO/plumbing**: keep `composeWebService` optional in DTOs/strategyConfig for back-compat,
  but it is no longer required or UI-set.
- **`compose.service.ts` `up()`**: stop requiring a web service and stop `docker compose ps -q <svc>`.
  Return the compose **project** (containers are discovered by project label). Routing default service
  for domains with null `targetService` = first sanitized service (else per-domain `targetService`).
- **`build-orchestrator.service.ts` `runComposeRelease`**: rewrite the health gate to discover **all**
  project containers (`containers.listForDeployment`) and, **for each service that declares a healthcheck
  (declared or injected-custom), wait until `State.Health === "healthy"`**; services without one pass on
  running. WEB domain-target services with no healthcheck fall back to the existing HTTP probe via the
  edge IP. Set the release `LIVE` with `containerId: null` (store `composeProject` only).
- **`release.containerId` → optional**: it already is nullable in schema + DTO. Stop setting it for
  compose; keep setting it for single-container (Dockerfile/Image) deployments.
- **Console/logs resolution** (`backend/src/console/console.service.ts`, `backend/src/logs/logs.controller.ts`):
  when no `container` param, resolve to the **sole** discovered container; if there are several and none
  was chosen, return a clear "select a container" error (the frontend already shows the container
  selector when >1). Runtime-log collector already follows all containers — unchanged.
- **Per-release delete cleanup** (`build-orchestrator` release delete): guard the
  `stopAndRemove(release.containerId)` on a non-null id; compose stacks are torn down via
  `compose.down()` by project (unchanged).

---

## Phase 3 — Creation wizard refinements
`frontend/src/pages/CreateDeploymentPage.tsx`:
- **3a. Omit the "Build & run" step when not needed.** With `healthCheckPath` moving to the Health
  section (Phase 4), WEB no longer has anything in Build & run → the step is **WORKER/CRON only**.
  `stepsFor(type)` includes `build` only for WORKER/CRON; WEB flow = Type → Source → Domain → Resources
  → Review. Drop `healthCheckPath` from `WizardState`/`toPayload`/`BuildRunStep`.
- **3b. Primary-domain switch.** Add a `domainEnabled` toggle to the Domain step (MUI
  `Switch`+`FormControlLabel`, mirroring `WebhookTab.tsx`'s auto-deploy toggle). Default **off** so it
  reads as optional; the FQDN/service/port fields render only when on, and `toPayload` sends domain
  fields only when enabled.
- **3c. Domain field uses `DomainPicker`.** Replace the plain FQDN `TextField` with
  `frontend/src/components/DomainPicker.tsx` (the inline field + zone-picker modal already used in
  `DomainsManager`), `value={state.domain} onChange={(fqdn) => patch({ domain: fqdn })}`.
- **3d. Service/port fields.** Keep them gated behind the switch with clear helper text. They stay
  free-text (no running containers exist pre-creation, so no exposed-port autocomplete), feeding
  `domainService`/`domainPort` → the primary domain's `targetService`/`targetPort` (Phase-2 routing).

---

## Phase 4 — New "Health" section

### 4a. Section wiring
- `frontend/src/deploymentSections.ts`: add `{ key: "health", label: "Health" }` (e.g. after
  Resources).
- `frontend/src/components/AppShell.tsx`: add `health` to `SECTION_ICONS` (e.g. `HealthAndSafetyIcon`)
  and to `CONTAINER_SCOPED` (per-container, like Resources).
- `frontend/src/pages/DeploymentDetailPage.tsx`: add `{active === "health" && <HealthTab deployment={deployment} container={selected} />}`.

### 4b. Surface declared healthchecks (read-only)
- `backend/src/docker/docker.service.ts` `inspectContainer`: also read `info.Config?.Healthcheck`
  → add `declaredHealthcheck?: { test: string[]; interval; timeout; retries; startPeriod }` to
  `ContainerStatus`.
- `backend/src/backups/dto/backup.dto.ts` `ContainerDto` + `containers.service.ts` mapping: add the
  `health` (runtime `State.Health.Status`) and `declaredHealthcheck` fields so the Health tab can show
  them grayed/read-only.

### 4c. Custom healthchecks (user-defined, injected at runtime)
- **Storage**: add `healthcheck?: { test: string; interval?: string; timeout?: string; retries?: number; startPeriod?: string }`
  to `backend/src/deployments/resource-limits.ts` `ResourceLimits` (+ `ResourceLimitsDto`). Per-compose-service
  it rides the existing `serviceResources` JSONB; for single-container it rides the deployment-level
  limits. (No new table — reuses the proven per-service plumbing.)
- **Injection (compose)**: `compose.service.ts` `resourceFragment` adds a `healthcheck:` block (CMD-SHELL
  test + durations) to the service.
- **Injection (non-compose)**: `docker.service.ts` `runContainer` sets `Healthcheck` in the create config
  (durations parsed `"30s"`→ns via a small helper); `build-orchestrator` passes the deployment's custom
  healthcheck. Because injected healthchecks surface as Docker `State.Health`, the Phase-2 "wait for
  healthy" gate covers them automatically.

### 4d. HealthTab component + move restart policy here
- New `frontend/src/components/HealthTab.tsx`, structured like `ResourcesTab` (single-container vs
  per-compose-service via `useServiceResources`/`useUpdateServiceResources`). Each scope shows:
  - **Declared healthcheck** (read-only, grayed) from `ContainerDto.declaredHealthcheck`.
  - **Custom healthcheck** editor (test/interval/timeout/retries) → saved into `ResourceLimits.healthcheck`.
  - **Restart policy** selector — **moved out of `ResourcesTab.tsx`** (remove the restart `SettingRow`
    + `RESTART_OPTIONS` usage there; reuse them here). Global via `useUpdateDeployment`
    (`deployment.restartPolicy`) for single-container; per-service via `serviceResources` for compose.
  - **Readiness path** (`healthCheckPath`) for WEB — **moved out of `SettingsTab.tsx`** to here.

---

## Verification
1. `make dev`. Source step: token sits above ref; typing a bogus ref after a valid URL turns the ref
   field red; a real branch/tag clears it.
2. Create two deployments from the same compose file that hardcodes `container_name:` — both deploy
   (no "name already in use"); containers are project-prefixed.
3. Compose deploy with **no** web-service field: the stack comes up, services with declared/custom
   healthchecks gate the cutover, domains route per `targetService`; console/logs prompt for a
   container when several exist, default to the sole one otherwise.
4. Delete a deployment from the detail page → redirected to `/deployments`, no "failed to fetch"; the
   list shows "Deleting" and the row isn't clickable until it's gone. States read as "Running",
   "Deploying", "Stopped" (not caps).
5. Wizard: WEB skips "Build & run"; Domain step has an off-by-default switch; enabling it shows the
   `DomainPicker` modal + service/port.
6. Health tab: declared healthchecks show grayed; a custom healthcheck (e.g. `curl -f localhost/health`,
   30s/10s/3) is injected and gates the next deploy; restart policy + readiness path now live here and
   are gone from Resources/Settings.
7. `make lint && make typecheck && make test` clean; regenerate the OpenAPI client after each backend
   DTO change.

## Notes / risks
- Phase 2's anchor dissolution is the riskiest piece (touches console, logs, release tracking,
  compose health gate). Land it behind Phase 1; verify console/logs on a multi-service compose stack.
- Keep `composeWebService`/`webServicePort`/`release.containerId` columns for back-compat (no
  destructive migrations); they simply stop being required/UI-set.
