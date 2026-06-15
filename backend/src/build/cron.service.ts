import {
  BadRequestException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { type Deployment, DeploymentsService } from "../deployments/deployments.service";
import { DockerService } from "../docker/docker.service";
import { EnvVarsService } from "../env-vars/env-vars.service";
import { CronRunsService } from "./cron-runs.service";
import { ReleasesService } from "./releases.service";

const MAX_LOG_CHARS = 100_000;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Runs CRON deployments as scheduled one-shot containers. Each enabled CRON deployment registers a
// CronJob on its expression; a tick runs the active release's image to completion and records the
// run (status + exit code + logs). Overlapping runs of the same deployment are skipped.
@Injectable()
export class CronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CronService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly envVars: EnvVarsService,
    private readonly docker: DockerService,
    private readonly runs: CronRunsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const deployment of await this.deployments.findAll()) {
      this.sync(deployment);
    }
  }

  // Register, refresh, or remove a deployment's cron job to match its current state.
  sync(deployment: Deployment): void {
    if (
      deployment.type === "CRON" &&
      deployment.activeReleaseId &&
      deployment.cronExpr &&
      deployment.state !== "STOPPED"
    ) {
      this.register(deployment);
    } else {
      this.unregister(deployment.id);
    }
  }

  unregister(deploymentId: string): void {
    try {
      this.registry.deleteCronJob(this.jobName(deploymentId));
    } catch {
      // Not registered.
    }
  }

  async runNow(deploymentId: string): Promise<void> {
    const deployment = await this.deployments.findById(deploymentId);

    if (!deployment || deployment.type !== "CRON") {
      throw new BadRequestException("not a CRON deployment");
    }

    await this.execute(deployment.id);
  }

  private register(deployment: Deployment): void {
    if (!deployment.cronExpr) {
      return;
    }

    this.unregister(deployment.id);

    let job: CronJob;

    try {
      job = new CronJob(deployment.cronExpr, () => void this.execute(deployment.id));
    } catch {
      this.logger.warn(`invalid cron expression for ${deployment.name}: ${deployment.cronExpr}`);

      return;
    }

    this.registry.addCronJob(this.jobName(deployment.id), job as unknown as CronJob);
    job.start();
  }

  private async execute(deploymentId: string): Promise<void> {
    if (this.running.has(deploymentId)) {
      this.logger.warn(`skipping overlapping cron run for ${deploymentId}`);

      return;
    }

    const deployment = await this.deployments.findById(deploymentId);

    if (!deployment || deployment.type !== "CRON" || !deployment.activeReleaseId) {
      return;
    }

    const release = await this.releases.findById(deployment.activeReleaseId);

    if (!release?.imageTag) {
      return;
    }

    this.running.add(deploymentId);
    const run = await this.runs.start(deploymentId);

    try {
      const env = await this.envVars.resolveForInjection(deploymentId, "RUNTIME");
      const result = await this.docker.runToCompletion({
        image: release.imageTag,
        env,
        ...(deployment.runCommand ? { command: ["sh", "-c", deployment.runCommand] } : {}),
        ...(deployment.memoryLimitMb ? { memoryMb: deployment.memoryLimitMb } : {}),
        ...(deployment.nanoCpus ? { nanoCpus: deployment.nanoCpus } : {}),
      });

      await this.runs.finish(run.id, {
        status: result.exitCode === 0 ? "SUCCESS" : "FAILED",
        exitCode: result.exitCode,
        logs: result.logs.slice(0, MAX_LOG_CHARS),
      });
    } catch (error) {
      await this.runs.finish(run.id, {
        status: "FAILED",
        exitCode: null,
        logs: describeError(error),
      });
    } finally {
      this.running.delete(deploymentId);
    }
  }

  private jobName(deploymentId: string): string {
    return `cron:${deploymentId}`;
  }
}
