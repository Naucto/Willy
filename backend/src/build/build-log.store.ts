import { EventEmitter } from "node:events";
import { Injectable } from "@nestjs/common";

interface LogBuffer {
  lines: string[];
  emitter: EventEmitter;
  done: boolean;
}

const MAX_LINES = 2000;

// In-memory build-log buffers keyed by release id, with live fan-out for SSE.
// Logs are ephemeral (lost on restart) in this phase; durable storage comes later.
@Injectable()
export class BuildLogStore {
  private readonly buffers = new Map<string, LogBuffer>();

  append(releaseId: string, line: string): void {
    const buffer = this.buffer(releaseId);
    buffer.lines.push(line);

    if (buffer.lines.length > MAX_LINES) {
      buffer.lines.shift();
    }

    buffer.emitter.emit("line", line);
  }

  finish(releaseId: string): void {
    const buffer = this.buffer(releaseId);
    buffer.done = true;
    buffer.emitter.emit("done");
  }

  snapshot(releaseId: string): string[] {
    return [...this.buffer(releaseId).lines];
  }

  // Replays buffered lines, then streams new ones until done. Returns an unsubscribe fn.
  subscribe(releaseId: string, onLine: (line: string) => void, onDone: () => void): () => void {
    const buffer = this.buffer(releaseId);

    for (const line of buffer.lines) {
      onLine(line);
    }

    if (buffer.done) {
      onDone();

      return () => {};
    }

    buffer.emitter.on("line", onLine);
    buffer.emitter.once("done", onDone);

    return () => {
      buffer.emitter.off("line", onLine);
      buffer.emitter.off("done", onDone);
    };
  }

  private buffer(releaseId: string): LogBuffer {
    let buffer = this.buffers.get(releaseId);

    if (!buffer) {
      buffer = { lines: [], emitter: new EventEmitter(), done: false };
      buffer.emitter.setMaxListeners(50);
      this.buffers.set(releaseId, buffer);
    }

    return buffer;
  }
}
