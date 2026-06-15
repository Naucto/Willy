import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// In-process build queue: serializes work per deployment (a deployment never builds
// concurrently with itself) while capping total concurrency across deployments.
@Injectable()
export class BuildQueue {
  private readonly tails = new Map<string, Promise<unknown>>();
  private readonly waiters: Array<() => void> = [];
  private readonly maxConcurrent: number;
  private active = 0;

  constructor(config: ConfigService) {
    this.maxConcurrent = config.get<number>("BUILD_CONCURRENCY") ?? 2;
  }

  enqueue(deploymentId: string, task: () => Promise<void>): void {
    const previous = this.tails.get(deploymentId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.runWithLimit(task));
    this.tails.set(deploymentId, next);
  }

  private async runWithLimit(task: () => Promise<void>): Promise<void> {
    await this.acquire();

    try {
      await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;

      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.waiters.shift();

    if (next) {
      next();
    }
  }
}
