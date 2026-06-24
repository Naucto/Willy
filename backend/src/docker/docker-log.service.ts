import { type Duplex, PassThrough, type Readable } from "node:stream";
import { Inject, Injectable } from "@nestjs/common";
import type Docker from "dockerode";
import { DOCKER_CLIENT } from "./docker-client";

// Matches an RFC3339 timestamp, the prefix Docker prepends to each line when `timestamps: true`.
const RFC3339 = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g;

export interface LogStreamOptions {
  // Number of trailing lines to replay before following; omit for all available.
  tail?: number;
  // Only stream lines at/after this Unix-seconds timestamp (used to resume without re-replaying).
  since?: number;
  // Prefix each line with its RFC3339 timestamp (so a follow can be resumed by `since`).
  timestamps?: boolean;
}

// Container log streaming and interactive console (exec) over the Docker Engine API.
@Injectable()
export class DockerLogService {
  constructor(@Inject(DOCKER_CLIENT) private readonly docker: Docker) {}

  async getLogStream(id: string, options: LogStreamOptions = {}): Promise<Readable> {
    const container = this.docker.getContainer(id);
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      ...(options.tail !== undefined ? { tail: options.tail } : {}),
      ...(options.since !== undefined ? { since: options.since } : {}),
      timestamps: options.timestamps ?? false,
    });
    const out = new PassThrough();

    // Logs are multiplexed (no TTY) — demux stdout+stderr into one text stream.
    this.docker.modem.demuxStream(stream, out, out);
    stream.on("end", () => out.end());
    stream.on("error", (error: unknown) => {
      out.destroy(error instanceof Error ? error : new Error(String(error)));
    });

    return out;
  }

  // Epoch-ms of the container's most recent log line, or null if it has none. Used to tell a
  // silently-stalled follow (the daemon has newer lines than we've collected) from a quiet one.
  async latestLogTimestampMs(id: string): Promise<number | null> {
    const container = this.docker.getContainer(id);
    const raw = (await container.logs({
      follow: false,
      stdout: true,
      stderr: true,
      tail: 1,
      timestamps: true,
    })) as unknown as Buffer;
    // The 8-byte multiplex frame headers are binary noise to the timestamp regex; the last RFC3339
    // match is the latest line's time. Parsing to ms drops sub-ms precision, which is fine here.
    const matches = raw.toString("utf8").match(RFC3339);

    if (!matches || matches.length === 0) {
      return null;
    }

    const ms = Date.parse(matches[matches.length - 1] as string);

    return Number.isNaN(ms) ? null : ms;
  }

  // Opens an interactive shell (TTY) in a container for the console. The returned duplex
  // carries raw terminal bytes both ways; resize forwards window changes to the PTY.
  async execShell(
    containerId: string,
  ): Promise<{ stream: Duplex; resize: (cols: number, rows: number) => Promise<void> }> {
    const exec = await this.docker.getContainer(containerId).exec({
      Cmd: ["/bin/sh"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });
    const stream = (await exec.start({ hijack: true, stdin: true, Tty: true })) as Duplex;

    return { stream, resize: (cols, rows) => exec.resize({ w: cols, h: rows }) };
  }
}
