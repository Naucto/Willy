import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { DeploymentsService } from "../deployments/deployments.service";
import type { DeploymentStatsDto, DeploymentStatsSampleDto } from "./dto/stats.dto";
import { deploymentKey, hostKey, MetricsStoreService } from "./metrics-store.service";
import { StatsService } from "./stats.service";

const SAMPLE_INTERVAL_MS = 15_000;

// Only deployments with a live container are worth sampling — others would just record zeros.
const RUNNING_STATES = new Set(["RUNNING", "DEGRADED", "DEPLOYING"]);

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Records host + per-deployment utilization snapshots on a fixed interval so the panel can plot
// history. Reuses StatsService's live aggregation; failures are logged but never throw, so a
// transient Docker hiccup can't kill the timer.
@Injectable()
export class StatsSamplerService {
  private readonly logger = new Logger(StatsSamplerService.name);

  constructor(
    private readonly stats: StatsService,
    private readonly store: MetricsStoreService,
    private readonly deployments: DeploymentsService,
  ) {}

  @Interval(SAMPLE_INTERVAL_MS)
  async sample(): Promise<void> {
    await Promise.all([this.sampleHost(), this.sampleDeployments()]);
  }

  private async sampleHost(): Promise<void> {
    try {
      await this.store.record(hostKey(), await this.stats.systemStats());
    } catch (error) {
      this.logger.warn(`host metrics sampling failed: ${describeError(error)}`);
    }
  }

  private async sampleDeployments(): Promise<void> {
    const deployments = await this.deployments.findAll();
    const running = deployments.filter((deployment) => RUNNING_STATES.has(deployment.state));

    await Promise.all(
      running.map(async (deployment) => {
        try {
          const stats = await this.stats.deploymentStats(deployment.id);
          await this.store.record(deploymentKey(deployment.id), toSample(stats));
        } catch (error) {
          this.logger.warn(
            `metrics sampling for ${deployment.name} failed: ${describeError(error)}`,
          );
        }
      }),
    );
  }
}

// Drop the per-container/volume breakdown — only the plotted scalars are stored as history.
function toSample(stats: DeploymentStatsDto): Omit<DeploymentStatsSampleDto, "ts"> {
  return {
    cpuPercent: stats.cpuPercent,
    cpuCores: stats.cpuCores,
    memUsageBytes: stats.memUsageBytes,
    memLimitBytes: stats.memLimitBytes,
    swapBytes: stats.swapBytes,
    storageBytes: stats.storageBytes,
  };
}
