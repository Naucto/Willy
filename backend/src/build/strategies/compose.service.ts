import { execFile, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { stringify as toYaml } from "yaml";
import { WillyError } from "../../common/errors";
import {
  type Deployment,
  DeploymentsService,
  composeConfig,
} from "../../deployments/deployments.service";
import type { ResourceLimits, RestartPolicyName } from "../../deployments/resource-limits";
import { DockerService } from "../../docker/docker.service";
import {
  LabelGeneratorService,
  OWNER_LABEL,
  groupRoutes,
} from "../../traefik/label-generator.service";

const exec = promisify(execFile);

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

  return out;
}

const EDGE_NETWORK = "willy_edge";
const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const OVERRIDE_FILE = "willy.override.yml";
// Newer launches get a lower priority; matches the single-container swap convention.
const PRIORITY_BASE = 9_000_000_000_000;

export class ComposeError extends WillyError {}

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
    private readonly deployments: DeploymentsService,
    private readonly labels: LabelGeneratorService,
  ) {
    const host = config.get<string>("DOCKER_PROXY_HOST") ?? "docker-socket-proxy";
    const port = config.get<number>("DOCKER_PROXY_PORT") ?? 2375;
    this.dockerHost = `tcp://${host}:${port}`;
  }

  projectName(deployment: Deployment): string {
    return `willy_${deployment.name}`;
  }

  // Build + (re)create the stack in place; returns the web service container id.
  async up(deployment: Deployment, dir: string, onLog: (line: string) => void): Promise<string> {
    const config = composeConfig(deployment);
    const webService = config.composeWebService;

    if (!webService) {
      throw new ComposeError("compose deployment requires a web service name");
    }

    const project = this.projectName(deployment);
    const composeFile = config.composeFilePath || "docker-compose.yml";
    const files = ["-f", composeFile, "-f", OVERRIDE_FILE];

    await this.writeOverride(deployment, dir, webService);
    await this.runCompose(
      ["-p", project, ...files, "up", "-d", "--build", "--remove-orphans"],
      dir,
      onLog,
    );

    const { stdout } = await exec(
      "docker",
      ["compose", "-p", project, ...files, "ps", "-q", webService],
      { cwd: dir, env: this.env() },
    );
    const containerId = stdout.trim().split("\n")[0];

    if (!containerId) {
      throw new ComposeError(`web service "${webService}" not found after compose up`);
    }

    return containerId;
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

  private async writeOverride(
    deployment: Deployment,
    dir: string,
    webService: string,
  ): Promise<void> {
    // The web service is always present so it can be located + health-checked after `up`, even if
    // no domain happens to route to it.
    const services: Record<string, Record<string, unknown>> = {
      [webService]: { labels: { [OWNER_LABEL]: deployment.id } },
    };
    const networks: Record<string, unknown> = {};

    if (deployment.type === "WEB") {
      const routes = await this.deployments.domainRoutes(deployment.id);

      if (routes.length === 0) {
        throw new ComposeError("WEB compose deployment requires a domain");
      }

      const defaultPort = deployment.webServicePort ?? 80;
      const priority = PRIORITY_BASE - Date.now();
      const groups = groupRoutes(routes, { defaultService: webService, defaultPort });

      // Labels live on the targeted container, so split the groups back out per compose service:
      // each service gets attached to the edge network and carries the routers/services for its
      // own (service, port) groups.
      const byService = new Map<string, typeof groups>();

      for (const group of groups) {
        const name = group.service ?? webService;
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

    const override: Record<string, unknown> = { services };

    if (Object.keys(networks).length > 0) {
      override.networks = networks;
    }

    await writeFile(join(dir, OVERRIDE_FILE), toYaml(override), "utf8");
  }

  private runCompose(args: string[], dir: string, onLog: (line: string) => void): Promise<void> {
    const child = spawn("docker", ["compose", ...args], { cwd: dir, env: this.env() });

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

  private env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
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
