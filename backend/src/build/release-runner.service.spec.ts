import { describe, expect, it, vi } from "vitest";
import type { Deployment, DeploymentsService } from "../deployments/deployments.service";
import type { DockerContainerService } from "../docker/docker-container.service";
import type { BuildLogStore } from "./build-log.store";
import type { ContainerOps } from "./container-ops.service";
import type { GitService } from "../git/git.service";
import type { CronService } from "./cron.service";
import type { HealthProber } from "./health-prober.service";
import type { ImageBuilder } from "./image-builder.service";
import { ReleaseRunner } from "./release-runner.service";
import type { ReleasesService } from "./releases.service";
import type { RuntimeLogCollector } from "./runtime-log.collector";
import type { ComposeService } from "./strategies/compose.service";

interface Mocks {
  deployments: { findById: ReturnType<typeof vi.fn>; setState: ReturnType<typeof vi.fn> };
  cron: { unregister: ReturnType<typeof vi.fn> };
  compose: { down: ReturnType<typeof vi.fn> };
  containerOps: { removeAllContainers: ReturnType<typeof vi.fn> };
  runtimeLog: { stopDeployment: ReturnType<typeof vi.fn> };
  dockerContainers: { listByLabel: ReturnType<typeof vi.fn> };
}

function makeRunner(deployment: Partial<Deployment>): { runner: ReleaseRunner; mocks: Mocks } {
  const mocks: Mocks = {
    deployments: {
      findById: vi.fn().mockResolvedValue(deployment),
      setState: vi.fn().mockResolvedValue(undefined),
    },
    cron: { unregister: vi.fn() },
    compose: { down: vi.fn().mockResolvedValue(undefined) },
    containerOps: { removeAllContainers: vi.fn().mockResolvedValue(undefined) },
    runtimeLog: { stopDeployment: vi.fn() },
    dockerContainers: { listByLabel: vi.fn().mockResolvedValue([]) },
  };

  const runner = new ReleaseRunner(
    mocks.deployments as unknown as DeploymentsService,
    {} as unknown as ReleasesService,
    {} as unknown as GitService,
    mocks.dockerContainers as unknown as DockerContainerService,
    mocks.compose as unknown as ComposeService,
    {} as unknown as BuildLogStore,
    mocks.cron as unknown as CronService,
    mocks.runtimeLog as unknown as RuntimeLogCollector,
    {} as unknown as ImageBuilder,
    mocks.containerOps as unknown as ContainerOps,
    {} as unknown as HealthProber,
  );

  return { runner, mocks };
}

describe("ReleaseRunner.runStop", () => {
  it("unregisters the schedule for a CRON deployment and marks it STOPPED", async () => {
    const { runner, mocks } = makeRunner({ id: "d1", type: "CRON", buildStrategy: "DOCKERFILE" });

    await runner.runStop("d1");

    expect(mocks.cron.unregister).toHaveBeenCalledWith("d1");
    expect(mocks.containerOps.removeAllContainers).not.toHaveBeenCalled();
    expect(mocks.deployments.setState).toHaveBeenCalledWith("d1", "STOPPED");
  });

  it("tears the compose stack down for a COMPOSE deployment", async () => {
    const deployment: Partial<Deployment> = { id: "d2", type: "WEB", buildStrategy: "COMPOSE" };
    const { runner, mocks } = makeRunner(deployment);

    await runner.runStop("d2");

    expect(mocks.compose.down).toHaveBeenCalledWith(deployment);
    expect(mocks.deployments.setState).toHaveBeenCalledWith("d2", "STOPPED");
  });

  it("removes containers for a single-container deployment", async () => {
    const { runner, mocks } = makeRunner({ id: "d3", type: "WEB", buildStrategy: "DOCKERFILE" });

    await runner.runStop("d3");

    expect(mocks.containerOps.removeAllContainers).toHaveBeenCalledWith("d3");
    expect(mocks.deployments.setState).toHaveBeenCalledWith("d3", "STOPPED");
  });

  it("marks ERROR when the action fails and nothing is left running", async () => {
    const { runner, mocks } = makeRunner({ id: "d4", type: "WEB", buildStrategy: "DOCKERFILE" });
    mocks.containerOps.removeAllContainers.mockRejectedValue(new Error("boom"));
    mocks.dockerContainers.listByLabel.mockResolvedValue([]);

    await runner.runStop("d4");

    expect(mocks.deployments.setState).toHaveBeenLastCalledWith("d4", "ERROR");
  });

  it("marks DEGRADED when the action fails but a container is still up", async () => {
    const { runner, mocks } = makeRunner({ id: "d5", type: "WEB", buildStrategy: "DOCKERFILE" });
    mocks.containerOps.removeAllContainers.mockRejectedValue(new Error("boom"));
    mocks.dockerContainers.listByLabel.mockResolvedValue([{ Id: "still-up" }]);

    await runner.runStop("d5");

    expect(mocks.deployments.setState).toHaveBeenLastCalledWith("d5", "DEGRADED");
  });
});
