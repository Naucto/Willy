import { type Duplex, PassThrough, type Readable } from "node:stream";
import { Inject, Injectable } from "@nestjs/common";
import type Docker from "dockerode";
import { DOCKER_CLIENT } from "./docker-client";

// Container log streaming and interactive console (exec) over the Docker Engine API.
@Injectable()
export class DockerLogService {
  constructor(@Inject(DOCKER_CLIENT) private readonly docker: Docker) {}

  async getLogStream(id: string, tail = 200): Promise<Readable> {
    const container = this.docker.getContainer(id);
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
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
