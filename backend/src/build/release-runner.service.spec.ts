import { describe, expect, it, vi } from "vitest";
import type { ContainersService } from "../containers/containers.service";
import type { Deployment, DeploymentsService } from "../deployments/deployments.service";
import type { DockerContainerService } from "../docker/docker-container.service";
import type { GitService } from "../git/git.service";
import type { BuildLogStore } from "./build-log.store";
import type { ContainerOps } from "./container-ops.service";
import type { CronService } from "./cron.service";
import type { HealthProber } from "./health-prober.service";
import type { ImageBuilder } from "./image-builder.service";
import { ReleaseRunner } from "./release-runner.service";
import type { ReleasesService } from "./releases.service";
import type { RuntimeLogCollector } from "./runtime-log.collector";
import type { ComposeService } from "./strategies/compose.service";

type Fn = ReturnType<typeof vi.fn>;

interface Mocks {
  deployments: {
    findById: Fn;
    setState: Fn;
    setActiveRelease: Fn;
    resolveGitToken: Fn;
  };
  releases: { findById: Fn; setStatus: Fn };
  git: { clone: Fn; cleanup: Fn };
  cron: { unregister: Fn };
  compose: {
    down: Fn;
    downRelease: Fn;
    baseProject: Fn;
    prepare: Fn;
    upBase: Fn;
    upRelease: Fn;
  };
  containers: { listForProject: Fn };
  containerOps: { removeAllContainers: Fn };
  health: { composeHealthy: Fn; firstUnreachableRoute: Fn };
  runtimeLog: { stopDeployment: Fn; syncDeployment: Fn };
  buildLog: { append: Fn; finish: Fn };
  dockerContainers: { listByLabel: Fn };
}

function makeRunner(deployment: Partial<Deployment>): { runner: ReleaseRunner; mocks: Mocks } {
  const mocks: Mocks = {
    deployments: {
      findById: vi.fn().mockResolvedValue(deployment),
      setState: vi.fn().mockResolvedValue(undefined),
      setActiveRelease: vi.fn().mockResolvedValue(undefined),
      resolveGitToken: vi.fn().mockResolvedValue(undefined),
    },
    releases: {
      findById: vi.fn().mockResolvedValue({ id: "r-new" }),
      setStatus: vi.fn().mockResolvedValue(undefined),
    },
    git: {
      clone: vi.fn().mockResolvedValue({ dir: "/tmp/clone", sha: "abc123" }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    },
    cron: { unregister: vi.fn() },
    compose: {
      down: vi.fn().mockResolvedValue(undefined),
      downRelease: vi.fn().mockResolvedValue(undefined),
      baseProject: vi.fn().mockReturnValue("willy_app"),
      prepare: vi
        .fn()
        .mockResolvedValue({ split: { pinned: ["db"], eligible: ["web"] }, composeFile: "d.yml" }),
      upBase: vi.fn().mockResolvedValue({ project: "willy_app" }),
      upRelease: vi.fn().mockResolvedValue({ project: "willy_app_rnewrelea" }),
    },
    containers: { listForProject: vi.fn().mockResolvedValue([]) },
    containerOps: { removeAllContainers: vi.fn().mockResolvedValue(undefined) },
    health: {
      composeHealthy: vi.fn().mockResolvedValue(true),
      firstUnreachableRoute: vi.fn().mockResolvedValue(null),
    },
    runtimeLog: { stopDeployment: vi.fn(), syncDeployment: vi.fn().mockResolvedValue(undefined) },
    buildLog: { append: vi.fn(), finish: vi.fn() },
    dockerContainers: { listByLabel: vi.fn().mockResolvedValue([]) },
  };

  const runner = new ReleaseRunner(
    mocks.deployments as unknown as DeploymentsService,
    mocks.releases as unknown as ReleasesService,
    mocks.git as unknown as GitService,
    mocks.dockerContainers as unknown as DockerContainerService,
    mocks.compose as unknown as ComposeService,
    mocks.buildLog as unknown as BuildLogStore,
    mocks.cron as unknown as CronService,
    mocks.runtimeLog as unknown as RuntimeLogCollector,
    {} as unknown as ImageBuilder,
    mocks.containerOps as unknown as ContainerOps,
    mocks.health as unknown as HealthProber,
    mocks.containers as unknown as ContainersService,
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

describe("ReleaseRunner.runComposeRelease (blue-green)", () => {
  // A COMPOSE deployment with a prior active release living in its own release project (blue).
  const composeDeployment = (over: Partial<Deployment> = {}): Deployment =>
    ({
      id: "app",
      name: "app",
      type: "WEB",
      buildStrategy: "COMPOSE",
      gitUrl: "https://git/app",
      gitRef: "main",
      activeReleaseId: "r-old",
      ...over,
    }) as Deployment;

  // findById routes prior vs. new release; prior sits in blue release project "willy_app_rold".
  const routeReleases = (mocks: Mocks, priorProject: string | null): void => {
    mocks.releases.findById.mockImplementation(async (id: string) =>
      id === "r-old" ? { id, composeProject: priorProject } : { id },
    );
  };

  it("brings up base then release, cuts over, and tears down only the prior release", async () => {
    const { runner, mocks } = makeRunner(composeDeployment());
    routeReleases(mocks, "willy_app_rold");

    await runner.runRelease(composeDeployment(), "r-new");

    expect(mocks.compose.upBase).toHaveBeenCalled();
    expect(mocks.compose.upRelease).toHaveBeenCalled();
    // Blue release project torn down; base project never stopped.
    expect(mocks.compose.downRelease).toHaveBeenCalledWith("willy_app_rold");
    expect(mocks.compose.down).not.toHaveBeenCalled();
    expect(mocks.deployments.setActiveRelease).toHaveBeenCalledWith("app", "r-new");
    expect(mocks.deployments.setState).toHaveBeenCalledWith("app", "RUNNING");
    expect(mocks.releases.setStatus).toHaveBeenCalledWith("r-old", "SUPERSEDED");
  });

  it("leaves the running stack up on a failed gate (DEGRADED), tearing down only green", async () => {
    const { runner, mocks } = makeRunner(composeDeployment());
    routeReleases(mocks, "willy_app_rold");
    mocks.health.composeHealthy.mockResolvedValue(false);

    await runner.runRelease(composeDeployment(), "r-new");

    // Green (the just-started release project) is removed; blue + base keep serving.
    expect(mocks.compose.downRelease).toHaveBeenCalledWith("willy_app_rnewrelea");
    expect(mocks.compose.downRelease).not.toHaveBeenCalledWith("willy_app_rold");
    expect(mocks.compose.down).not.toHaveBeenCalled();
    expect(mocks.deployments.setActiveRelease).not.toHaveBeenCalled();
    expect(mocks.deployments.setState).toHaveBeenLastCalledWith("app", "DEGRADED");
  });

  it("never tears down the base project when a pre-split prior recorded it", async () => {
    const { runner, mocks } = makeRunner(composeDeployment());
    // Legacy deploy: the prior release's project IS the base project.
    routeReleases(mocks, "willy_app");

    await runner.runRelease(composeDeployment(), "r-new");

    expect(mocks.compose.downRelease).not.toHaveBeenCalled();
    expect(mocks.deployments.setState).toHaveBeenCalledWith("app", "RUNNING");
  });

  it("skips the base up for an all-eligible stack", async () => {
    const { runner, mocks } = makeRunner(composeDeployment());
    routeReleases(mocks, "willy_app_rold");
    mocks.compose.prepare.mockResolvedValue({
      split: { pinned: [], eligible: ["web", "worker"] },
      composeFile: "d.yml",
    });

    await runner.runRelease(composeDeployment(), "r-new");

    expect(mocks.compose.upBase).not.toHaveBeenCalled();
    expect(mocks.compose.upRelease).toHaveBeenCalled();
    expect(mocks.deployments.setState).toHaveBeenCalledWith("app", "RUNNING");
  });

  it("leaves an all-pinned stack running (no release project) when its gate fails", async () => {
    const { runner, mocks } = makeRunner(composeDeployment());
    routeReleases(mocks, "willy_app");
    mocks.compose.prepare.mockResolvedValue({
      split: { pinned: ["db"], eligible: [] },
      composeFile: "d.yml",
    });
    mocks.health.firstUnreachableRoute.mockResolvedValue("api unreachable on 3000");

    await runner.runRelease(composeDeployment(), "r-new");

    expect(mocks.compose.upRelease).not.toHaveBeenCalled();
    // No release project ⇒ nothing torn down; the recreated stack is left running.
    expect(mocks.compose.downRelease).not.toHaveBeenCalled();
    expect(mocks.compose.down).not.toHaveBeenCalled();
    expect(mocks.deployments.setState).toHaveBeenLastCalledWith("app", "DEGRADED");
  });
});
