import { describe, expect, it } from "vitest";
import type { ContainersService } from "../containers/containers.service";
import type { Deployment } from "../deployments/deployments.service";
import type { DomainsService } from "../deployments/domains.service";
import type { DockerContainerService } from "../docker/docker-container.service";
import type { ContainerStatus } from "../docker/docker.types";
import { HealthProber } from "./health-prober.service";

type Inspect = (id: string) => Promise<ContainerStatus | undefined>;

// Only the immediate-verdict branches are exercised — the timeout loops poll for up to 90s, which a
// unit test shouldn't wait on. The happy probeWeb path returns on the first inspect, so it's fast.
function makeProber(
  inspect: Inspect,
  opts: { containers?: unknown[]; routes?: unknown[] } = {},
): HealthProber {
  return new HealthProber(
    { inspectContainer: inspect } as unknown as DockerContainerService,
    { listForDeployment: async () => opts.containers ?? [] } as unknown as ContainersService,
    { domainRoutes: async () => opts.routes ?? [] } as unknown as DomainsService,
  );
}

const status = (over: Partial<ContainerStatus>): ContainerStatus =>
  ({ id: "c1", running: true, health: undefined, ...over }) as ContainerStatus;

describe("HealthProber.probeWeb", () => {
  it("is healthy as soon as a no-healthcheck container is running", async () => {
    const prober = makeProber(async () => status({ running: true, health: undefined }));

    await expect(prober.probeWeb("c1")).resolves.toBe(true);
  });

  it("is healthy once a declared healthcheck reports healthy", async () => {
    const prober = makeProber(async () => status({ running: true, health: "healthy" }));

    await expect(prober.probeWeb("c1")).resolves.toBe(true);
  });
});

describe("HealthProber.probeWorker", () => {
  it("fails immediately when the container is not running", async () => {
    const prober = makeProber(async () => status({ running: false }));

    await expect(prober.probeWorker("c1")).resolves.toBe(false);
  });

  it("fails immediately when the container is unhealthy", async () => {
    const prober = makeProber(async () => status({ running: true, health: "unhealthy" }));

    await expect(prober.probeWorker("c1")).resolves.toBe(false);
  });
});

describe("HealthProber.allContainersHealthy", () => {
  const containers = [
    { id: "a", service: null },
    { id: "b", service: null },
  ];

  it("is true when every container is running and (if checked) healthy", async () => {
    const prober = makeProber(async (id) =>
      status({ id, running: true, health: id === "a" ? "healthy" : undefined }),
    );

    await expect(prober.allContainersHealthy(containers)).resolves.toBe(true);
  });

  it("is false when a container is not running", async () => {
    const prober = makeProber(async (id) => status({ id, running: id === "a" }));

    await expect(prober.allContainersHealthy(containers)).resolves.toBe(false);
  });

  it("is false when a container declares a healthcheck that isn't healthy", async () => {
    const prober = makeProber(async (id) =>
      status({ id, running: true, health: id === "a" ? "healthy" : "starting" }),
    );

    await expect(prober.allContainersHealthy(containers)).resolves.toBe(false);
  });
});

describe("HealthProber.firstUnreachableRoute", () => {
  it("returns null when no route maps to a known container (nothing to probe)", async () => {
    const prober = makeProber(async () => undefined, {
      containers: [],
      routes: [{ fqdn: "x.example.com", targetService: null, targetPort: null, isPrimary: true }],
    });

    await expect(
      prober.firstUnreachableRoute({ id: "d1", webServicePort: null } as unknown as Deployment),
    ).resolves.toBeNull();
  });
});
