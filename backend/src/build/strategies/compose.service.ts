import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { WillyError } from "../../common/errors";
import { type Deployment, composeConfig } from "../../deployments/deployments.service";
import { DomainsService } from "../../deployments/domains.service";
import type { ResourceLimits, RestartPolicyName } from "../../deployments/resource-limits";
import { EnvVarsService } from "../../env-vars/env-vars.service";
import { DockerContainerService } from "../../docker/docker-container.service";
import { DockerImageService } from "../../docker/docker-image.service";
import { DockerSystemService } from "../../docker/docker-system.service";
import {
  LabelGeneratorService,
  OWNER_LABEL,
  groupRoutes,
} from "../../traefik/label-generator.service";

// Willy's restart-policy enum → the strings `docker compose` understands.
const RESTART_COMPOSE: Record<RestartPolicyName, string> = {
  NO: "no",
  ON_FAILURE: "on-failure",
  ALWAYS: "always",
  UNLESS_STOPPED: "unless-stopped",
};

// Translate a service's resource limits into compose service keys honoured by `docker compose up`
// (non-swarm): mem_limit/cpus/cap_add/cap_drop/restart/logging.
function resourceFragment(limits: ResourceLimits): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (limits.memoryLimitMb) {
    out.mem_limit = `${limits.memoryLimitMb}m`;
  }

  if (limits.nanoCpus) {
    out.cpus = limits.nanoCpus / 1e9;
  }

  if (limits.capAdd?.length) {
    out.cap_add = limits.capAdd;
  }

  if (limits.capDrop?.length) {
    out.cap_drop = limits.capDrop;
  }

  if (limits.restartPolicy) {
    out.restart = RESTART_COMPOSE[limits.restartPolicy];
  }

  if (limits.logMaxSizeMb || limits.logMaxFiles) {
    out.logging = {
      driver: "json-file",
      options: {
        "max-size": limits.logMaxSizeMb ? `${limits.logMaxSizeMb}m` : "10m",
        "max-file": String(limits.logMaxFiles ?? 3),
      },
    };
  }

  if (limits.healthcheck?.test.trim()) {
    const { test, interval, timeout, retries, startPeriod } = limits.healthcheck;

    out.healthcheck = {
      test: ["CMD-SHELL", test],
      ...(interval ? { interval } : {}),
      ...(timeout ? { timeout } : {}),
      ...(retries ? { retries } : {}),
      ...(startPeriod ? { start_period: startPeriod } : {}),
    };
  }

  return out;
}

const EDGE_NETWORK = "willy_edge";
const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
// Generated compose files, written next to the user's compose file so relative build contexts still
// resolve. Base = pinned singletons (keep the base project + volumes); release = eligible services,
// blue-greened under a release-scoped project. Each gets a Willy override for labels/env/resources.
const BASE_FILE = "willy.base.yml";
const RELEASE_FILE = "willy.release.yml";
const BASE_OVERRIDE = "willy.base.override.yml";
const RELEASE_OVERRIDE = "willy.release.override.yml";
// Newer launches get a lower priority; matches the single-container swap convention.
const PRIORITY_BASE = 9_000_000_000_000;

export class ComposeError extends WillyError {}

export interface SanitizedCompose {
  // The rewritten compose YAML, safe to `docker compose up` once per deployment.
  yaml: string;
  // Service names in declaration order; the first is the routing/health default.
  services: string[];
  // Declared `healthcheck` blocks, keyed by service name (only services that declare one).
  healthchecks: Record<string, unknown>;
  // Each service's `image:` (null for build-only services), used to default the routed port to the
  // image's first EXPOSE when no web port is configured.
  images: Record<string, string | null>;
  // Services whose published `ports:` were stripped (declaration order), so the caller can tell the
  // user in the build log why their host mapping no longer applies.
  strippedPorts: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Baseline hardening: every compose service gets `no-new-privileges` so a deployed app can't gain
// capabilities via setuid binaries (mirrors the single-container path). Appends to — never replaces —
// any security_opt the user already declared (e.g. a seccomp/apparmor profile).
function withNoNewPrivileges(existing: unknown): string[] {
  const opts = Array.isArray(existing)
    ? existing.filter((o): o is string => typeof o === "string")
    : [];

  if (opts.some((o) => o.replace(/\s+/g, "").startsWith("no-new-privileges"))) {
    return opts;
  }

  return [...opts, "no-new-privileges:true"];
}

// Rewrites a user's compose file so two deployments from the same source don't collide. A hardcoded
// `container_name` overrides Docker's project prefix (and an override file can't *delete* a key), so
// two stacks would fight over one fixed name ("name already in use"); we strip it from every service
// and let Docker derive `willy_<name>-<service>-N`. Published `ports:` are stripped too: Willy routes
// by domain over the edge network (never host ports), so a host mapping is useless here and two stacks
// publishing the same host port would clash on bind ("port is already allocated"). The obsolete
// top-level `version` is dropped as well (compose v2 ignores it and only warns). Pure (yaml string →
// result) so it can be unit-tested.
export function sanitizeComposeYaml(raw: string): SanitizedCompose {
  const doc = asRecord(parseYaml(raw));

  delete doc.version;

  const rawServices = asRecord(doc.services);
  const services: string[] = [];
  const healthchecks: Record<string, unknown> = {};
  const images: Record<string, string | null> = {};
  const strippedPorts: string[] = [];
  const sanitized: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(rawServices)) {
    services.push(name);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const service = { ...(value as Record<string, unknown>) };
      delete service.container_name;

      service.security_opt = withNoNewPrivileges(service.security_opt);

      if (service.ports !== undefined) {
        delete service.ports;
        strippedPorts.push(name);
      }

      if (service.healthcheck !== undefined) {
        healthchecks[name] = service.healthcheck;
      }

      images[name] = typeof service.image === "string" ? service.image : null;
      sanitized[name] = service;
    } else {
      images[name] = null;
      sanitized[name] = value;
    }
  }

  doc.services = sanitized;

  return { yaml: toYaml(doc), services, healthchecks, images, strippedPorts };
}

// Blue-green safety: partition a stack's services into ones safe to run in two copies at once
// (eligible) and ones holding exclusive state that must stay a singleton (pinned). Pinned services keep
// the base project name so their volumes never move; eligible services get a release-scoped project and
// are blue-greened. Conservative: anything ambiguous is pinned.
export interface ServiceSplit {
  eligible: string[];
  pinned: string[];
  // Services whose own compose file sets `restart:`. Willy's override must leave those alone —
  // the override file wins the merge, so writing into it would silently replace what was asked for.
  declaresRestart: string[];
}

// A mount that two live copies would fight over (or that would silently diverge). Read-only mounts and
// anonymous volumes (each copy gets its own) are safe. A writable named volume or host bind pins.
function mountPins(entry: unknown): boolean {
  if (typeof entry === "string") {
    const parts = entry.split(":");

    // "TARGET" alone is an anonymous volume — each copy gets a private one, so it's safe.
    if (parts.length < 2) {
      return false;
    }

    const source = parts[0] ?? "";
    const mode = parts[2] ?? "";

    if (/(^|,)ro(,|$)/.test(mode)) {
      return false;
    }

    // A path source is a host bind; a bare token is a named volume. Both writable ⇒ pin.
    return source.length > 0;
  }

  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const mount = entry as Record<string, unknown>;

    if (mount.read_only === true) {
      return false;
    }

    if (mount.type === "tmpfs" || mount.type === "npipe") {
      return false;
    }

    if (mount.type === "bind") {
      return true;
    }

    // A named volume (writable, has a source) pins; an anonymous volume (no source) is safe.
    return typeof mount.source === "string" && mount.source.length > 0;
  }

  // Unknown shape ⇒ default to pinned.
  return true;
}

// True when a service joins any non-default network. v1 keeps such stacks fully in-place (pinned) rather
// than rewiring an arbitrary user network graph across two projects.
function usesCustomNetwork(networks: unknown): boolean {
  const names = Array.isArray(networks)
    ? networks.filter((n): n is string => typeof n === "string")
    : networks && typeof networks === "object"
      ? Object.keys(networks as Record<string, unknown>)
      : [];

  return names.some((name) => name !== "default");
}

function servicePins(service: unknown): boolean {
  if (!service || typeof service !== "object" || Array.isArray(service)) {
    return true;
  }

  const svc = service as Record<string, unknown>;
  const networkMode = svc.network_mode;

  if (
    typeof networkMode === "string" &&
    (networkMode === "host" ||
      networkMode.startsWith("container:") ||
      networkMode.startsWith("service:"))
  ) {
    return true;
  }

  if (svc.privileged === true || svc.pid === "host" || svc.ipc === "host") {
    return true;
  }

  if (Array.isArray(svc.devices) && svc.devices.length > 0) {
    return true;
  }

  if (usesCustomNetwork(svc.networks)) {
    return true;
  }

  const volumes = svc.volumes;

  if (Array.isArray(volumes)) {
    return volumes.some(mountPins);
  }

  // A `volumes` key that isn't a list is unexpected ⇒ pin defensively.
  return volumes !== undefined;
}

export function classifyComposeServices(doc: Record<string, unknown>): ServiceSplit {
  const services = asRecord(doc.services);
  const eligible: string[] = [];
  const pinned: string[] = [];
  const declaresRestart: string[] = [];

  for (const [name, service] of Object.entries(services)) {
    (servicePins(service) ? pinned : eligible).push(name);

    if (asRecord(service).restart !== undefined) {
      declaresRestart.push(name);
    }
  }

  return { eligible, pinned, declaresRestart };
}

// Prune a service's `depends_on` (list or condition-map form) to the services that live in the same
// project — otherwise `docker compose` rejects a reference to a service not in the file.
function pruneDependsOn(service: Record<string, unknown>, keep: Set<string>): void {
  const dependsOn = service.depends_on;

  if (Array.isArray(dependsOn)) {
    const kept = dependsOn.filter((dep): dep is string => typeof dep === "string" && keep.has(dep));

    if (kept.length > 0) {
      service.depends_on = kept;
    } else {
      delete service.depends_on;
    }

    return;
  }

  if (dependsOn && typeof dependsOn === "object") {
    const kept = Object.fromEntries(
      Object.entries(dependsOn as Record<string, unknown>).filter(([dep]) => keep.has(dep)),
    );

    if (Object.keys(kept).length > 0) {
      service.depends_on = kept;
    } else {
      delete service.depends_on;
    }
  }
}

function pickServices(doc: Record<string, unknown>, names: string[]): Record<string, unknown> {
  const all = asRecord(doc.services);
  const out: Record<string, unknown> = {};

  for (const name of names) {
    out[name] = all[name];
  }

  return out;
}

const RELEASE_DEFAULT_NET = "default";
const RELEASE_BASE_NET = "willy_base";

// Full base + release compose configs for a blue-green deploy. `baseYaml` is the pinned services (they
// keep the base project + their volumes); `releaseYaml` is the eligible services rewired onto the edge
// network plus (when pinned exist) an external link to the base project's default network so they can
// still reach pinned services (e.g. the DB) by their compose DNS name.
export interface SplitCompose {
  sanitized: SanitizedCompose;
  eligible: string[];
  pinned: string[];
  declaresRestart: string[];
  baseYaml: string;
  releaseYaml: string;
}

export function splitComposeConfig(raw: string, deploymentName: string): SplitCompose {
  const sanitized = sanitizeComposeYaml(raw);
  const doc = asRecord(parseYaml(sanitized.yaml));
  const { eligible, pinned, declaresRestart } = classifyComposeServices(doc);

  const baseYaml = buildBaseYaml(doc, pinned);
  const releaseYaml = buildReleaseYaml(doc, eligible, pinned.length > 0, deploymentName);

  return { sanitized, eligible, pinned, declaresRestart, baseYaml, releaseYaml };
}

// Pinned services only, keeping top-level volumes/networks so their named volumes stay
// `willy_<name>_<vol>`. Emitting a pinned-only file (rather than the whole file) lets the base project's
// `--remove-orphans` reap legacy eligible containers left in the base project by a pre-split deploy.
function buildBaseYaml(doc: Record<string, unknown>, pinned: string[]): string {
  const keep = new Set(pinned);
  const services = pickServices(doc, pinned);

  for (const value of Object.values(services)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      pruneDependsOn(value as Record<string, unknown>, keep);
    }
  }

  const base: Record<string, unknown> = { ...doc, services };

  return toYaml(base);
}

// Eligible services only, with networks rewired: each joins the release default net (intra-eligible
// DNS), the external edge net (Traefik), and — when a base project exists — the external base default
// net (to reach pinned services by name). A `:ro` named volume an eligible service still references is
// pinned to the base-created volume so it isn't recreated empty.
function buildReleaseYaml(
  doc: Record<string, unknown>,
  eligible: string[],
  hasBase: boolean,
  deploymentName: string,
): string {
  const keep = new Set(eligible);
  const services = pickServices(doc, eligible);
  const memberships = hasBase
    ? [RELEASE_DEFAULT_NET, RELEASE_BASE_NET, EDGE_NETWORK]
    : [RELEASE_DEFAULT_NET, EDGE_NETWORK];
  const externalVolumes: Record<string, unknown> = {};

  for (const value of Object.values(services)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const service = value as Record<string, unknown>;

    pruneDependsOn(service, keep);
    service.networks = [...memberships];

    // Any named volume an eligible service still uses can only be read-only (a writable one would have
    // pinned it); point it at the base-created volume rather than a fresh empty release-scoped one.
    if (Array.isArray(service.volumes)) {
      for (const mount of service.volumes) {
        const named = readOnlyNamedVolume(mount);

        if (named) {
          externalVolumes[named] = { external: true, name: `willy_${deploymentName}_${named}` };
        }
      }
    }
  }

  const networks: Record<string, unknown> = { [EDGE_NETWORK]: { external: true } };

  if (hasBase) {
    networks[RELEASE_BASE_NET] = { external: true, name: `willy_${deploymentName}_default` };
  }

  const release: Record<string, unknown> = { services, networks };

  // Networks and volumes are rewritten above because they are what the two tiers must not share.
  // Everything else the file declared at the top level still belongs to these services: a
  // `build.secrets` entry resolves against the project's own `secrets:`, and rebuilding the release
  // file from scratch left it pointing at a declaration that was no longer in the project —
  // `service "x" refers to undefined build secret y`.
  for (const key of ["secrets", "configs"]) {
    if (doc[key] !== undefined) {
      release[key] = doc[key];
    }
  }

  if (Object.keys(externalVolumes).length > 0) {
    release.volumes = externalVolumes;
  }

  return toYaml(release);
}

// The named-volume source of a read-only mount (short or long form), else null.
function readOnlyNamedVolume(entry: unknown): string | null {
  if (typeof entry === "string") {
    const parts = entry.split(":");

    if (parts.length < 2 || !/(^|,)ro(,|$)/.test(parts[2] ?? "")) {
      return null;
    }

    const source = parts[0] ?? "";

    return source.length > 0 && !/^[./~]/.test(source) ? source : null;
  }

  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const mount = entry as Record<string, unknown>;

    if (mount.read_only === true && mount.type === "volume" && typeof mount.source === "string") {
      return mount.source;
    }
  }

  return null;
}

// The split plan produced by prepare() and consumed by upBase()/upRelease().
export interface ComposePlan {
  split: SplitCompose;
  composeFile: string;
  defaultService: string | null;
  defaultServiceImage: string | null;
}

// Runs docker-compose stacks for COMPOSE deployments. Builds go through the same socket-proxy with the
// legacy builder (BuildKit is blocked), driven by the docker CLI + compose plugin in the image. A
// deploy splits the stack into a pinned base project (singletons + volumes) and a release-scoped
// project for the eligible tier that is blue-greened; teardown works by container labels (no file).
@Injectable()
export class ComposeService {
  private readonly dockerHost: string;

  constructor(
    config: ConfigService,
    private readonly dockerContainers: DockerContainerService,
    private readonly dockerImages: DockerImageService,
    private readonly dockerSystem: DockerSystemService,
    private readonly domains: DomainsService,
    private readonly labels: LabelGeneratorService,
    private readonly envVars: EnvVarsService,
  ) {
    const host = config.get<string>("DOCKER_PROXY_HOST") ?? "docker-socket-proxy";
    const port = config.get<number>("DOCKER_PROXY_PORT") ?? 2375;
    this.dockerHost = `tcp://${host}:${port}`;
  }

  // Stable project for the pinned (singleton) tier. Volumes stay `willy_<name>_<vol>` forever.
  baseProject(deployment: Deployment): string {
    return `willy_${deployment.name}`;
  }

  // Release-scoped project for the eligible (blue-green) tier — old and new coexist under distinct
  // projects during a cutover.
  releaseProject(deployment: Deployment, releaseShort: string): string {
    return `willy_${deployment.name}_r${releaseShort}`;
  }

  // Split the stack into base (pinned) + release (eligible) compose files written next to the user's
  // compose file, returning the plan the up steps consume. Does not touch Docker.
  async prepare(
    deployment: Deployment,
    dir: string,
    onLog: (line: string) => void,
  ): Promise<ComposePlan> {
    const config = composeConfig(deployment);
    const composeFile = config.composeFilePath || "docker-compose.yml";
    const split = splitComposeConfig(
      await readFile(join(dir, composeFile), "utf8"),
      deployment.name,
    );

    if (split.sanitized.services.length === 0) {
      throw new ComposeError("compose file declares no services");
    }

    for (const name of split.sanitized.strippedPorts) {
      onLog(
        `[willy] removed published host ports from service "${name}" — apps are reached by domain, not host ports.`,
      );
    }

    const files = this.filesFor(composeFile);

    await writeFile(join(dir, files.baseFile), split.baseYaml, "utf8");
    await writeFile(join(dir, files.releaseFile), split.releaseYaml, "utf8");

    // Domains that don't pin a service route to the explicitly-configured web service when one is
    // still set (back-compat with deployments created before the anchor was dissolved), otherwise
    // the first declared service.
    const defaultService = config.composeWebService || split.sanitized.services[0] || null;
    const defaultServiceImage = defaultService
      ? (split.sanitized.images[defaultService] ?? null)
      : null;

    return { split, composeFile, defaultService, defaultServiceImage };
  }

  // (Re)create the pinned tier in place under the stable base project. `--remove-orphans` on a
  // pinned-only file also reaps legacy eligible containers left in the base project by a pre-split
  // deploy. No-op-safe when nothing pinned changed. Router names use the stable deployment name.
  async upBase(
    deployment: Deployment,
    dir: string,
    plan: ComposePlan,
    onLog: (line: string) => void,
  ): Promise<{ project: string }> {
    const project = this.baseProject(deployment);
    const files = this.filesFor(plan.composeFile);

    await this.writeOverride({
      deployment,
      dir,
      filename: files.baseOverride,
      serviceNames: plan.split.pinned,
      declaresRestart: plan.split.declaresRestart,
      routerPrefix: deployment.name,
      defaultService: plan.defaultService,
      defaultServiceImage: plan.defaultServiceImage,
      attachEdge: true,
    });
    await this.runCompose(
      [
        "-p",
        project,
        "-f",
        files.baseFile,
        "-f",
        files.baseOverride,
        "up",
        "-d",
        "--build",
        "--no-deps",
        "--remove-orphans",
        ...plan.split.pinned,
      ],
      dir,
      onLog,
      await this.interpolationEnv(deployment),
    );

    return { project };
  }

  // Bring up the eligible tier under a release-scoped project alongside the currently-serving one.
  // Networks live in the release file (edge + external base link); router names are release-scoped and
  // launch at a lower priority so the old release keeps serving until cutover.
  async upRelease(
    deployment: Deployment,
    dir: string,
    plan: ComposePlan,
    releaseShort: string,
    onLog: (line: string) => void,
  ): Promise<{ project: string }> {
    const project = this.releaseProject(deployment, releaseShort);
    const files = this.filesFor(plan.composeFile);

    await this.writeOverride({
      deployment,
      dir,
      filename: files.releaseOverride,
      serviceNames: plan.split.eligible,
      declaresRestart: plan.split.declaresRestart,
      routerPrefix: `${deployment.name}-${releaseShort}`,
      defaultService: plan.defaultService,
      defaultServiceImage: plan.defaultServiceImage,
      attachEdge: false,
    });
    await this.runCompose(
      [
        "-p",
        project,
        "-f",
        files.releaseFile,
        "-f",
        files.releaseOverride,
        "up",
        "-d",
        "--build",
        "--no-deps",
        ...plan.split.eligible,
      ],
      dir,
      onLog,
      await this.interpolationEnv(deployment),
    );

    return { project };
  }

  // Generated file paths, placed in the compose file's own directory so relative build contexts resolve.
  private filesFor(composeFile: string): {
    baseFile: string;
    releaseFile: string;
    baseOverride: string;
    releaseOverride: string;
  } {
    const dir = dirname(composeFile);
    const at = (name: string): string => (dir === "." ? name : join(dir, name));

    return {
      baseFile: at(BASE_FILE),
      releaseFile: at(RELEASE_FILE),
      baseOverride: at(BASE_OVERRIDE),
      releaseOverride: at(RELEASE_OVERRIDE),
    };
  }

  // Tear down every project belonging to a deployment (base + any release projects), by owner label.
  // Used on stop/delete. Cutover uses downRelease to drop only the superseded release project.
  async down(deployment: Deployment): Promise<void> {
    const ids = await this.dockerContainers.listByLabel(OWNER_LABEL, deployment.id);
    const projects = new Set<string>();

    for (const id of ids) {
      const info = await this.dockerContainers.inspectContainer(id);

      if (info?.composeProject) {
        projects.add(info.composeProject);
      }

      await this.dockerContainers.stopAndRemove(id);
    }

    // Always include the base project's network even if it had no owner-labelled container left.
    projects.add(this.baseProject(deployment));

    for (const project of projects) {
      await this.dockerSystem.removeNetwork(`${project}_default`);
    }
  }

  // Stop + remove a single release project (its containers by project label, then its default network).
  // The base project and any other release project are untouched.
  async downRelease(project: string): Promise<void> {
    const ids = await this.dockerContainers.listByLabel(COMPOSE_PROJECT_LABEL, project);

    for (const id of ids) {
      await this.dockerContainers.stopAndRemove(id);
    }

    await this.dockerSystem.removeNetwork(`${project}_default`);
  }

  // Writes a Willy override (Traefik labels for the web services in scope, per-service env + resource
  // limits, and the owner label on every service so discovery finds workers too). `attachEdge` adds the
  // edge-network membership inline (base tier); the release tier declares its networks in the release
  // file instead, so its override carries labels only.
  private async writeOverride(opts: {
    deployment: Deployment;
    dir: string;
    filename: string;
    serviceNames: string[];
    declaresRestart: string[];
    routerPrefix: string;
    defaultService: string | null;
    defaultServiceImage: string | null;
    attachEdge: boolean;
  }): Promise<void> {
    const { deployment, dir, filename, serviceNames, routerPrefix, attachEdge } = opts;
    const inScope = new Set(serviceNames);
    const ownRestart = new Set(opts.declaresRestart);
    const services: Record<string, Record<string, unknown>> = {};
    const networks: Record<string, unknown> = {};

    if (deployment.type === "WEB") {
      const routes = await this.domains.domainRoutes(deployment.id);

      if (routes.length === 0) {
        throw new ComposeError("WEB compose deployment requires a domain");
      }

      const exposed = opts.defaultServiceImage
        ? await this.dockerImages.imageExposedPorts(opts.defaultServiceImage)
        : [];
      const defaultPort = deployment.webServicePort ?? exposed[0] ?? 80;
      const priority = PRIORITY_BASE - Date.now();
      const groups = groupRoutes(routes, { defaultService: opts.defaultService, defaultPort });
      const byService = new Map<string, typeof groups>();

      for (const group of groups) {
        const name = group.service ?? opts.defaultService;

        // Only route the services this project owns; the other tier's override carries the rest.
        if (!name || !inScope.has(name)) {
          continue;
        }

        const bucket = byService.get(name) ?? [];

        bucket.push(group);
        byService.set(name, bucket);
      }

      for (const [name, serviceGroups] of byService) {
        const service: Record<string, unknown> = {
          labels: this.labels.forWebRoutes({
            deploymentId: deployment.id,
            routerPrefix,
            network: EDGE_NETWORK,
            priority,
            groups: serviceGroups,
          }),
        };

        if (attachEdge) {
          service.networks = ["default", EDGE_NETWORK];
        }

        services[name] = service;
      }

      if (attachEdge && byService.size > 0) {
        networks[EDGE_NETWORK] = { external: true };
      }
    }

    // The deployment's own restart policy, for every service this project owns. Without it a
    // compose deployment came up with Docker's default of `no`, so a host that rebooted brought
    // Willy back and left everything Willy deploys stopped — and the deployment still read as
    // RUNNING, because nothing had asked Docker.
    for (const name of inScope) {
      if (ownRestart.has(name)) {
        continue;
      }

      services[name] = {
        restart: RESTART_COMPOSE[deployment.restartPolicy],
        ...(services[name] ?? {}),
      };
    }

    // Per-service resource limits, restricted to the services this project owns. A service that
    // names its own policy overrides the deployment's.
    for (const [name, limits] of Object.entries(deployment.serviceResources ?? {})) {
      if (!inScope.has(name)) {
        continue;
      }

      const fragment = resourceFragment(limits);

      if (Object.keys(fragment).length > 0) {
        services[name] = { ...(services[name] ?? {}), ...fragment };
      }
    }

    // Inject Willy's encrypted env per in-scope service (shared "" vars plus each service's own).
    const envServices = new Set(
      [...Object.keys(services), ...(await this.envVars.servicesWithEnv(deployment.id))].filter(
        (name) => inScope.has(name),
      ),
    );

    for (const name of envServices) {
      const env = await this.envVars.resolveForInjection(deployment.id, "RUNTIME", name);

      if (Object.keys(env).length > 0) {
        services[name] = { ...(services[name] ?? {}), environment: env };
      }
    }

    // Every service in scope carries the owner label so discovery (and admin attribution) find it,
    // including non-web workers that get no routing labels.
    for (const name of serviceNames) {
      const existing = services[name] ?? {};

      services[name] = {
        ...existing,
        labels: { ...asRecord(existing.labels), [OWNER_LABEL]: deployment.id },
      };
    }

    const override: Record<string, unknown> = { services };

    if (Object.keys(networks).length > 0) {
      override.networks = networks;
    }

    await writeFile(join(dir, filename), toYaml(override), "utf8");
  }

  // The deployment-wide env vars, exposed to the `docker compose` process so `${VAR}` references in
  // the compose file interpolate (otherwise compose warns "variable is not set"). Both phases are
  // merged since interpolation is file-global, not build/runtime-specific. Passed via the process
  // env (not a .env file) so secrets never touch disk and arbitrary values need no escaping.
  private async interpolationEnv(deployment: Deployment): Promise<Record<string, string>> {
    return {
      ...(await this.envVars.resolveForInjection(deployment.id, "BUILD")),
      ...(await this.envVars.resolveForInjection(deployment.id, "RUNTIME")),
    };
  }

  private runCompose(
    args: string[],
    dir: string,
    onLog: (line: string) => void,
    extraEnv: Record<string, string> = {},
  ): Promise<void> {
    const child = spawn("docker", ["compose", ...args], { cwd: dir, env: this.env(extraEnv) });

    child.stdout.on("data", (chunk: Buffer) => this.emit(chunk, onLog));
    child.stderr.on("data", (chunk: Buffer) => this.emit(chunk, onLog));

    return new Promise<void>((resolve, reject) => {
      child.on("error", (error) => reject(new ComposeError(error.message)));
      child.on("close", (code) => {
        if (code === 0) {
          resolve();

          return;
        }

        reject(new ComposeError(`docker compose exited with code ${code}`));
      });
    });
  }

  // App env vars override the inherited process env, but Willy's docker control vars always win.
  private env(extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...extraEnv,
      DOCKER_HOST: this.dockerHost,
      DOCKER_BUILDKIT: "0",
      COMPOSE_BAKE: "false",
    };
  }

  private emit(chunk: Buffer, onLog: (line: string) => void): void {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line.length > 0) {
        onLog(line);
      }
    }
  }
}
