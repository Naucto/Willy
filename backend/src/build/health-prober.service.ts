import { Socket } from "node:net";
import { Injectable } from "@nestjs/common";
import { ContainersService } from "../containers/containers.service";
import type { Deployment } from "../deployments/deployments.service";
import { DomainsService } from "../deployments/domains.service";
import { DockerContainerService } from "../docker/docker-container.service";

const EDGE_NETWORK = "willy_edge";
const WEB_HEALTH_TIMEOUT_MS = 90_000;
const WORKER_HEALTH_GRACE_MS = 6_000;
const HEALTH_INTERVAL_MS = 2_000;

// After the stack is healthy, how long to keep trying to actually reach the app on its routed port
// before declaring the deployment unreachable (a port misconfiguration that would otherwise 502).
const REACHABILITY_TIMEOUT_MS = 15_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Best-effort TCP connect with a per-attempt timeout — true if the port accepts a connection.
function tcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();

    const finish = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

// Read-only deploy health gates: waits on container/stack health and verifies a deployment's routed
// ports are actually reachable. No state mutations — the orchestrator decides what to do with the
// verdict.
@Injectable()
export class HealthProber {
  constructor(
    private readonly dockerContainers: DockerContainerService,
    private readonly containers: ContainersService,
    private readonly domains: DomainsService,
  ) {}

  // WEB: healthy once the container is running. If it declares a healthcheck (image HEALTHCHECK or a
  // Willy-injected custom one) also wait until it reports "healthy" — Traefik refuses to route a
  // "starting"/"unhealthy" container, so cutting over before then would briefly drop traffic. A
  // container with no healthcheck is considered ready as soon as it's running.
  async probeWeb(containerId: string): Promise<boolean> {
    const deadline = Date.now() + WEB_HEALTH_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const status = await this.dockerContainers.inspectContainer(containerId);

      if (status?.running && (status.health === undefined || status.health === "healthy")) {
        return true;
      }

      await delay(HEALTH_INTERVAL_MS);
    }

    return false;
  }

  // WORKER/CRON: healthy if it survives a short grace window without exiting.
  async probeWorker(containerId: string): Promise<boolean> {
    const deadline = Date.now() + WORKER_HEALTH_GRACE_MS;

    while (Date.now() < deadline) {
      const status = await this.dockerContainers.inspectContainer(containerId);

      if (!status || !status.running || status.health === "unhealthy") {
        return false;
      }

      await delay(HEALTH_INTERVAL_MS);
    }

    return true;
  }

  // Compose health gate: wait until every project container is up to its bar. A service that
  // declares a healthcheck (in the file or injected by Willy) must report Docker-healthy; a service
  // with no healthcheck passes as soon as it's running. Returns false if the deadline passes first.
  async composeHealthy(deployment: Deployment): Promise<boolean> {
    const deadline = Date.now() + WEB_HEALTH_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const containers = await this.containers.listForDeployment(deployment);

      if (containers.length > 0 && (await this.allContainersHealthy(containers))) {
        return true;
      }

      await delay(HEALTH_INTERVAL_MS);
    }

    return false;
  }

  async allContainersHealthy(
    containers: { id: string; service: string | null }[],
  ): Promise<boolean> {
    for (const container of containers) {
      const status = await this.dockerContainers.inspectContainer(container.id);

      if (!status?.running) {
        return false;
      }

      // Only gate on a healthcheck when one exists (declared or injected); otherwise running is
      // enough — we don't health-check a container that defines no healthcheck.
      if (status.health !== undefined && status.health !== "healthy") {
        return false;
      }
    }

    return true;
  }

  // Verify each routed domain actually reaches its container on the port Traefik forwards to. Returns
  // a human-readable reason for the first unreachable route, or null when everything is reachable (or
  // can't be safely determined). Conservative: only probes a route when its target container is
  // unambiguous, so it never fails a healthy deploy on missing information.
  async firstUnreachableRoute(deployment: Deployment): Promise<string | null> {
    const [containers, routes] = await Promise.all([
      this.containers.listForDeployment(deployment),
      this.domains.domainRoutes(deployment.id),
    ]);

    for (const route of routes) {
      const container = route.targetService
        ? containers.find((c) => c.service === route.targetService)
        : containers.length === 1
          ? containers[0]
          : undefined;

      const ip = container?.networks.find((n) => n.name === EDGE_NETWORK)?.ip;

      if (!container || !ip) {
        continue;
      }

      const port = route.targetPort ?? deployment.webServicePort ?? container.exposedPorts[0] ?? 80;
      const deadline = Date.now() + REACHABILITY_TIMEOUT_MS;
      let reachable = false;

      while (Date.now() < deadline) {
        if (await tcpConnect(ip, port, HEALTH_INTERVAL_MS)) {
          reachable = true;
          break;
        }

        await delay(HEALTH_INTERVAL_MS);
      }

      if (!reachable) {
        const exposed = container.exposedPorts.length
          ? ` (the container exposes ${container.exposedPorts.join(", ")})`
          : "";

        return (
          `${route.fqdn} is routed to port ${port} but the app isn't accepting connections there${exposed}. ` +
          "Set the domain's port (Domains tab) to the port your app actually listens on."
        );
      }
    }

    return null;
  }
}
