import { Injectable } from "@nestjs/common";
import { LogStorageService } from "../logs/log-storage.service";

// Build logs, addressed by release id, on top of the durable LogStorageService. Keeping this thin
// wrapper lets the orchestrator stay oblivious to the `builds/` key namespace and gives build logs
// the same durability (survive restarts) as runtime logs.
@Injectable()
export class BuildLogStore {
  constructor(private readonly logs: LogStorageService) {}

  append(releaseId: string, line: string): void {
    this.logs.append(this.key(releaseId), line);
  }

  finish(releaseId: string): void {
    this.logs.finish(this.key(releaseId));
  }

  history(releaseId: string): Promise<string[]> {
    return this.logs.history(this.key(releaseId));
  }

  isLive(releaseId: string): boolean {
    return this.logs.isLive(this.key(releaseId));
  }

  onLine(releaseId: string, listener: (line: string) => void): () => void {
    return this.logs.onLine(this.key(releaseId), listener);
  }

  onDone(releaseId: string, listener: () => void): () => void {
    return this.logs.onDone(this.key(releaseId), listener);
  }

  private key(releaseId: string): string {
    return `builds/${releaseId}`;
  }
}
