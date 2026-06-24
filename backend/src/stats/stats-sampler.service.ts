import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { DeploymentsService } from "../deployments/deployments.service";
import type { DeploymentStatsDto, DeploymentStatsSampleDto, SystemStatsDto } from "./dto/stats.dto";
import { deploymentKey, hostKey, MetricsStoreService } from "./metrics-store.service";
import { StatsService } from "./stats.service";
import { rate } from "./stats.util";

const SAMPLE_INTERVAL_MS = 15_000;

// Only deployments with a live container are worth sampling — others would just record zeros.
const RUNNING_STATES = new Set(["RUNNING", "DEGRADED", "DEPLOYING"]);

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Cumulative byte counters from the previous sample of one source (host or deployment), kept in
// memory so the next tick can turn them into bytes/sec.
interface Cumulative {
  ts: number;
  netRxBytes: number;
  netTxBytes: number;
  blkReadBytes: number;
  blkWriteBytes: number;
}

interface IoRates {
  netRxBytesPerSec: number;
  netTxBytesPerSec: number;
  blkReadBytesPerSec: number;
  blkWriteBytesPerSec: number;
}

// Records host + per-deployment utilization snapshots on a fixed interval so the panel can plot
// history. Reuses StatsService's live aggregation; failures are logged but never throw, so a
// transient Docker hiccup can't kill the timer.
@Injectable()
export class StatsSamplerService {
  private readonly logger = new Logger(StatsSamplerService.name);

  // Docker's network/blkio counters are cumulative; we derive a rate by diffing against the prior
  // reading of the same source (keyed like the metrics store). First reading for a key → rate 0.
  private readonly lastCumulative = new Map<string, Cumulative>();

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
      const stats = await this.stats.systemStats();
      const rates = this.ioRates(hostKey(), stats);
      await this.store.record(hostKey(), { ...stats, ...rates });
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
          const key = deploymentKey(deployment.id);
          await this.store.record(key, toSample(stats, this.ioRates(key, stats)));
        } catch (error) {
          this.logger.warn(
            `metrics sampling for ${deployment.name} failed: ${describeError(error)}`,
          );
        }
      }),
    );
  }

  // Turn the cumulative byte counters of a sample into per-second rates against the previous reading
  // of the same source, then remember this reading for the next tick.
  private ioRates(key: string, current: DeploymentStatsDto | SystemStatsDto): IoRates {
    const now = Date.now();
    const previous = this.lastCumulative.get(key);
    const elapsedSec = previous ? (now - previous.ts) / 1000 : 0;

    const rates: IoRates = {
      netRxBytesPerSec: previous ? rate(current.netRxBytes, previous.netRxBytes, elapsedSec) : 0,
      netTxBytesPerSec: previous ? rate(current.netTxBytes, previous.netTxBytes, elapsedSec) : 0,
      blkReadBytesPerSec: previous
        ? rate(current.blkReadBytes, previous.blkReadBytes, elapsedSec)
        : 0,
      blkWriteBytesPerSec: previous
        ? rate(current.blkWriteBytes, previous.blkWriteBytes, elapsedSec)
        : 0,
    };

    this.lastCumulative.set(key, {
      ts: now,
      netRxBytes: current.netRxBytes,
      netTxBytes: current.netTxBytes,
      blkReadBytes: current.blkReadBytes,
      blkWriteBytes: current.blkWriteBytes,
    });

    return rates;
  }
}

// Drop the per-container/volume breakdown and the cumulative counters — only the plotted scalars and
// the derived I/O rates are stored as history.
function toSample(stats: DeploymentStatsDto, rates: IoRates): Omit<DeploymentStatsSampleDto, "ts"> {
  return {
    cpuPercent: stats.cpuPercent,
    cpuCores: stats.cpuCores,
    memUsageBytes: stats.memUsageBytes,
    memLimitBytes: stats.memLimitBytes,
    swapBytes: stats.swapBytes,
    storageBytes: stats.storageBytes,
    ...rates,
  };
}
