import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { RawData, WebSocket } from "ws";
import { ReleasesService } from "../build/releases.service";
import { ContainersService } from "../containers/containers.service";
import { DeploymentsService } from "../deployments/deployments.service";
import { DockerService } from "../docker/docker.service";

const TICKET_TTL_MS = 60_000;

interface ResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// Pure ticket helpers (HMAC over the panel's JWT secret) — unit-tested.
export function issueStreamTicket(secret: string, userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: now + TICKET_TTL_MS })).toString(
    "base64url",
  );

  return `${payload}.${sign(secret, payload)}`;
}

export function verifyStreamTicket(secret: string, token: string, now = Date.now()): boolean {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return false;
  }

  const expected = sign(secret, payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return false;
  }

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: number };

    return typeof exp === "number" && now < exp;
  } catch {
    return false;
  }
}

// WebSockets from the browser can't carry an auth header, so the console uses a short-lived
// signed ticket: issued to an authenticated operator over HTTP, presented as a query param on
// the WS upgrade, validated here. HMAC over JWT_SECRET — no extra key to manage.
@Injectable()
export class ConsoleService {
  private readonly logger = new Logger(ConsoleService.name);
  private readonly secret: string;

  constructor(
    config: ConfigService,
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly docker: DockerService,
    private readonly containers: ContainersService,
  ) {
    this.secret = config.getOrThrow<string>("JWT_SECRET");
  }

  issueTicket(userId: string): string {
    return issueStreamTicket(this.secret, userId);
  }

  verifyTicket(token: string): boolean {
    return verifyStreamTicket(this.secret, token);
  }

  // Bridges a browser terminal to an interactive shell in one of the deployment's containers. With
  // a container id/name (validated to belong to the deployment) attaches to that one; otherwise the
  // active release's container.
  async attach(ws: WebSocket, deploymentId: string, container?: string): Promise<void> {
    const deployment = await this.deployments.findById(deploymentId);

    if (!deployment) {
      ws.close(1011, "deployment not found");

      return;
    }

    let containerId: string | null;

    if (container) {
      containerId = await this.containers.resolveContainerId(deployment, container);
    } else {
      // Single-container deployments pin the active release's container; compose stores none, so
      // resolve to the sole discovered container (and refuse when several exist — pick one).
      const active = deployment.activeReleaseId
        ? await this.releases.findById(deployment.activeReleaseId)
        : undefined;

      if (active?.containerId) {
        containerId = active.containerId;
      } else {
        const resolved = await this.containers.defaultContainer(deployment);

        if (resolved.ambiguous) {
          ws.close(1011, "multiple containers — select one");

          return;
        }

        containerId = resolved.id;
      }
    }

    if (!containerId) {
      ws.close(1011, "no running container");

      return;
    }

    let session: Awaited<ReturnType<DockerService["execShell"]>>;

    try {
      session = await this.docker.execShell(containerId);
    } catch (error) {
      this.logger.warn(`console exec failed: ${error instanceof Error ? error.message : error}`);
      ws.close(1011, "exec failed");

      return;
    }

    const { stream, resize } = session;

    stream.on("data", (chunk: Buffer) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(chunk);
      }
    });
    stream.on("end", () => ws.close());
    stream.on("error", () => ws.close());

    // Binary frames are raw stdin; text frames are control messages (resize).
    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        stream.write(data as Buffer);

        return;
      }

      this.handleControl(data.toString(), resize);
    });
    ws.on("close", () => stream.end());
  }

  private handleControl(text: string, resize: (cols: number, rows: number) => Promise<void>): void {
    try {
      const message = JSON.parse(text) as Partial<ResizeMessage>;

      if (message.type === "resize" && message.cols && message.rows) {
        void resize(message.cols, message.rows);
      }
    } catch {
      // Ignore malformed control frames.
    }
  }
}
