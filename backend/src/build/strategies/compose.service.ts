import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { WillyError } from "../../common/errors";
import { type Deployment, composeConfig } from "../../deployments/deployments.service";
import { DomainsService } from "../../deployments/domains.service";
import type { ResourceLimits, RestartPolicyName } from "../../deployments/resource-limits";
import { EnvVarsService } from "../../env-vars/env-vars.service";
import { DockerService } from "../../docker/docker.service";
import { LabelGeneratorService, groupRoutes } from "../../traefik/label-generator.service";

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
const OVERRIDE_FILE = "willy.override.yml";
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

// Runs docker-compose stacks for COMPOSE deployments. Builds go through the same socket-proxy
// with the legacy builder (BuildKit is blocked), driven by the docker CLI + compose plugin in
// the image. A generated override attaches the web service to the edge network with Traefik
// labels; teardown removes the stack by its compose-project label (no compose file needed).
@Injectable()
export class ComposeService {
  private readonly dockerHost: string;

  constructor(
    config: ConfigService,
    private readonly docker: DockerService,
    private readonly domains: DomainsService,
    private readonly labels: LabelGeneratorService,
    private readonly envVars: EnvVarsService,
  ) {
    const host = config.get<string>("DOCKER_PROXY_HOST") ?? "docker-socket-proxy";
    const port = config.get<number>("DOCKER_PROXY_PORT") ?? 2375;
    this.dockerHost = `tcp://${host}:${port}`;
  }

  projectName(deployment: Deployment): string {
    return `willy_${deployment.name}`;
  }

  // Build + (re)create the whole stack in place. Returns the compose project, its service names
  // (declaration order), and the service untargeted domains route to — containers are discovered
  // afterwards by the project label, so there is no single "web service" anchor to locate.
  async up(
    deployment: Deployment,
    dir: string,
    onLog: (line: string) => void,
  ): Promise<{ project: string; services: string[]; defaultService: string | null }> {
    const config = composeConfig(deployment);
    const project = this.projectName(deployment);
    const composeFile = config.composeFilePath || "docker-compose.yml";

    const sanitized = await this.sanitizeComposeFile(dir, composeFile);

    if (sanitized.services.length === 0) {
      throw new ComposeError("compose file declares no services");
    }

    for (const name of sanitized.strippedPorts) {
      onLog(
        `[willy] removed published host ports from service "${name}" — apps are reached by domain, not host ports.`,
      );
    }

    const files = ["-f", composeFile, "-f", OVERRIDE_FILE];
    // Domains that don't pin a service route to the explicitly-configured web service when one is
    // still set (back-compat with deployments created before the anchor was dissolved), otherwise
    // the first declared service.
    const defaultService = config.composeWebService || sanitized.services[0] || null;
    const defaultServiceImage = defaultService ? (sanitized.images[defaultService] ?? null) : null;

    await this.writeOverride(deployment, dir, defaultService, defaultServiceImage);
    await this.runCompose(
      ["-p", project, ...files, "up", "-d", "--build", "--remove-orphans"],
      dir,
      onLog,
      await this.interpolationEnv(deployment),
    );

    return { project, services: sanitized.services, defaultService };
  }

  // The clone dir is ephemeral, so rewriting the compose file in place keeps every relative build
  // context valid while removing the cross-deployment collisions (see sanitizeComposeYaml).
  private async sanitizeComposeFile(dir: string, composeFile: string): Promise<SanitizedCompose> {
    const path = join(dir, composeFile);
    const sanitized = sanitizeComposeYaml(await readFile(path, "utf8"));

    await writeFile(path, sanitized.yaml, "utf8");

    return sanitized;
  }

  // Remove the whole stack by its compose-project label (works without the compose file).
  async down(deployment: Deployment): Promise<void> {
    const project = this.projectName(deployment);
    const ids = await this.docker.listByLabel(COMPOSE_PROJECT_LABEL, project);

    for (const id of ids) {
      await this.docker.stopAndRemove(id);
    }

    await this.docker.removeNetwork(`${project}_default`);
  }

  // Stop (but keep) every container in the stack by its compose-project label. Used when a redeploy's
  // healthcheck fails: the unhealthy stack must stop serving, but the containers are left in place so
  // they can be inspected.
  async stopAll(deployment: Deployment): Promise<void> {
    const project = this.projectName(deployment);
    const ids = await this.docker.listByLabel(COMPOSE_PROJECT_LABEL, project);

    for (const id of ids) {
      await this.docker.stopContainer(id);
    }
  }

  private async writeOverride(
    deployment: Deployment,
    dir: string,
    defaultService: string | null,
    defaultServiceImage: string | null,
  ): Promise<void> {
    const services: Record<string, Record<string, unknown>> = {};
    const networks: Record<string, unknown> = {};

    if (deployment.type === "WEB") {
      const routes = await this.domains.domainRoutes(deployment.id);

      if (routes.length === 0) {
        throw new ComposeError("WEB compose deployment requires a domain");
      }

      // No configured port → fall back to the default service image's first EXPOSE (best-effort; the
      // image may not be pulled yet, in which case this is empty), then 80. Mirrors the single-
      // container path and the frontend's "first exposed port" hint.
      const exposed = defaultServiceImage
        ? await this.docker.imageExposedPorts(defaultServiceImage)
        : [];
      const defaultPort = deployment.webServicePort ?? exposed[0] ?? 80;
      const priority = PRIORITY_BASE - Date.now();
      const groups = groupRoutes(routes, { defaultService, defaultPort });

      // Labels live on the targeted container, so split the groups back out per compose service:
      // each service gets attached to the edge network and carries the routers/services for its
      // own (service, port) groups.
      const byService = new Map<string, typeof groups>();

      for (const group of groups) {
        const name = group.service ?? defaultService;

        if (!name) {
          continue;
        }

        const bucket = byService.get(name) ?? [];

        bucket.push(group);
        byService.set(name, bucket);
      }

      for (const [name, serviceGroups] of byService) {
        services[name] = {
          labels: this.labels.forWebRoutes({
            deploymentId: deployment.id,
            routerPrefix: deployment.name,
            network: EDGE_NETWORK,
            priority,
            groups: serviceGroups,
          }),
          networks: ["default", EDGE_NETWORK],
        };
      }

      networks[EDGE_NETWORK] = { external: true };
    }

    // Merge per-service resource limits (memory/cpu/caps/restart/log retention) onto whichever
    // services they're configured for — independent of routing, so worker services get them too.
    for (const [name, limits] of Object.entries(deployment.serviceResources ?? {})) {
      const fragment = resourceFragment(limits);

      if (Object.keys(fragment).length > 0) {
        services[name] = { ...(services[name] ?? {}), ...fragment };
      }
    }

    // Inject Willy's encrypted env per service: shared ("") vars plus each service's own. Covers the
    // services Willy already writes (web/targeted/resourced) and any service with its own vars.
    const envServices = new Set([
      ...Object.keys(services),
      ...(await this.envVars.servicesWithEnv(deployment.id)),
    ]);

    for (const name of envServices) {
      const env = await this.envVars.resolveForInjection(deployment.id, "RUNTIME", name);

      if (Object.keys(env).length > 0) {
        services[name] = { ...(services[name] ?? {}), environment: env };
      }
    }

    const override: Record<string, unknown> = { services };

    if (Object.keys(networks).length > 0) {
      override.networks = networks;
    }

    await writeFile(join(dir, OVERRIDE_FILE), toYaml(override), "utf8");
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
