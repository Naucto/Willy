import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// Single-flight per target + a global concurrency cap, mirroring BuildQueue: two backups of the
// same target never overlap, and the host isn't swamped by parallel helper containers.
@Injectable()
export class BackupQueue {
  private readonly tails = new Map<string, Promise<unknown>>();
  private readonly waiters: Array<() => void> = [];
  private readonly maxConcurrent: number;
  private active = 0;

  constructor(config: ConfigService) {
    this.maxConcurrent = config.get<number>("BACKUP_CONCURRENCY") ?? 1;
  }

  enqueue(key: string, task: () => Promise<void>): void {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.runWithLimit(task));
    this.tails.set(key, next);
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
