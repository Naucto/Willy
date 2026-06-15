import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// Keep only the most recent lines per stream in memory; the on-disk file mirrors this bounded
// window, so both memory and disk stay bounded regardless of how chatty a container is.
const MAX_LINES = 2000;
// The file is rewritten from the in-memory buffer on a debounce rather than appended per line —
// cheaper than per-line IO and self-bounding (the file is always ≤ MAX_LINES).
const FLUSH_DEBOUNCE_MS = 500;
// How long a finished stream's buffer lingers in memory before it's dropped (late viewers then
// cold-load it from disk). Bounds memory for the unbounded number of historical build logs.
const EVICT_AFTER_FINISH_MS = 5 * 60 * 1000;

interface LogBuffer {
  lines: string[];
  emitter: EventEmitter;
  done: boolean;
  flushTimer: NodeJS.Timeout | undefined;
}

// Durable, bounded log storage with live fan-out. Each stream is addressed by a slash-separated
// key (e.g. `builds/<releaseId>`, `runtime/<deploymentId>/<service>`); the key maps to a `.log`
// file under LOGS_DIR. Live subscribers get an in-memory event stream; the file is the durable
// record that survives process restarts and outlives the container that produced it.
@Injectable()
export class LogStorageService {
  private readonly logger = new Logger(LogStorageService.name);
  private readonly baseDir: string;
  private readonly buffers = new Map<string, LogBuffer>();

  constructor(config: ConfigService) {
    this.baseDir = config.get<string>("LOGS_DIR") ?? "/var/lib/willy/logs";
  }

  append(key: string, line: string): void {
    const buffer = this.ensureBuffer(key);
    buffer.lines.push(line);

    if (buffer.lines.length > MAX_LINES) {
      buffer.lines.shift();
    }

    buffer.emitter.emit("line", line);
    this.scheduleFlush(key, buffer);
  }

  // Marks a stream complete (build finished). Flushes immediately, notifies live subscribers, and
  // schedules the buffer's eviction from memory (its history stays on disk).
  finish(key: string): void {
    const buffer = this.ensureBuffer(key);
    buffer.done = true;
    buffer.emitter.emit("done");
    void this.flush(key, buffer);

    setTimeout(() => this.buffers.delete(key), EVICT_AFTER_FINISH_MS).unref();
  }

  // A stream is "live" while its buffer is in memory and not finished — i.e. something is still
  // producing into it. Cold (post-restart) or finished streams are replay-only.
  isLive(key: string): boolean {
    const buffer = this.buffers.get(key);

    return Boolean(buffer) && !buffer?.done;
  }

  // Buffered lines (live) or the persisted window (cold) — the history to replay to a new viewer.
  async history(key: string): Promise<string[]> {
    const buffer = this.buffers.get(key);

    if (buffer) {
      return [...buffer.lines];
    }

    return this.readPersisted(key);
  }

  onLine(key: string, listener: (line: string) => void): () => void {
    const buffer = this.ensureBuffer(key);
    buffer.emitter.on("line", listener);

    return () => buffer.emitter.off("line", listener);
  }

  // Calls back when the stream finishes; fires immediately if it already has.
  onDone(key: string, listener: () => void): () => void {
    const buffer = this.ensureBuffer(key);

    if (buffer.done) {
      listener();

      return () => {};
    }

    buffer.emitter.once("done", listener);

    return () => buffer.emitter.off("done", listener);
  }

  private ensureBuffer(key: string): LogBuffer {
    let buffer = this.buffers.get(key);

    if (!buffer) {
      buffer = { lines: [], emitter: new EventEmitter(), done: false, flushTimer: undefined };
      buffer.emitter.setMaxListeners(50);
      this.buffers.set(key, buffer);
    }

    return buffer;
  }

  private scheduleFlush(key: string, buffer: LogBuffer): void {
    if (buffer.flushTimer) {
      return;
    }

    buffer.flushTimer = setTimeout(() => {
      buffer.flushTimer = undefined;
      void this.flush(key, buffer);
    }, FLUSH_DEBOUNCE_MS);
    buffer.flushTimer.unref();
  }

  private async flush(key: string, buffer: LogBuffer): Promise<void> {
    const path = this.filePath(key);

    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer.lines.join("\n"), "utf8");
    } catch (error) {
      this.logger.warn(`failed to persist log ${key}: ${describeError(error)}`);
    }
  }

  private async readPersisted(key: string): Promise<string[]> {
    try {
      const text = await readFile(this.filePath(key), "utf8");

      return text.split("\n").filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  // Sanitise each key segment so a service name can never escape the log directory. Dots are
  // dropped too (not just slashes), so a "../.." segment can't traverse out of LOGS_DIR.
  private filePath(key: string): string {
    const safe = key
      .split("/")
      .map((segment) => segment.replace(/[^a-zA-Z0-9_-]/g, "_"))
      .join("/");

    return join(this.baseDir, `${safe}.log`);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
