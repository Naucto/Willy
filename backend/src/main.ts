import "reflect-metadata";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { WebSocketServer } from "ws";
import { AppModule } from "./app.module";
import { ConsoleService } from "./console/console.service";

const CONSOLE_PATH = /^\/api\/console\/([^/]+)$/;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // The file manager ships file content as base64 in the JSON body, so lift the default 100kb cap to
  // the read ceiling (~13.5MB base64 for a 10MB file) + headroom. rawBody capture is preserved.
  app.useBodyParser("json", { limit: "16mb" });

  // Trust the single Traefik hop so req.ip reflects the real client (X-Forwarded-For) — required
  // for per-client rate limiting; clients can't reach the backend except through Traefik.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  // Health probes stay un-prefixed so the container healthcheck can hit /health directly.
  app.setGlobalPrefix("api", { exclude: ["health", "health/ready"] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // The OpenAPI UI/spec describes the whole API surface and is unauthenticated — keep it out of
  // production. Still available in dev for client generation and exploration.
  if (process.env.NODE_ENV !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Willy API")
      .setVersion("0.0.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  attachConsoleWebsocket(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
}

// Raw WS upgrade for the interactive console — authenticated by a query-param ticket since
// browser WebSockets can't send an Authorization header.
function attachConsoleWebsocket(app: Awaited<ReturnType<typeof NestFactory.create>>): void {
  const consoleService = app.get(ConsoleService);
  const wss = new WebSocketServer({ noServer: true });
  const server = app.getHttpServer();

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const match = CONSOLE_PATH.exec(url.pathname);

    if (!match) {
      socket.destroy();

      return;
    }

    const deploymentId = match[1] as string;

    // The ticket is bound to this deployment — a ticket for another deployment's console is rejected.
    if (!consoleService.verifyTicket(url.searchParams.get("ticket") ?? "", deploymentId)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();

      return;
    }

    const container = url.searchParams.get("container") ?? undefined;

    wss.handleUpgrade(req, socket, head, (ws) => {
      void consoleService.attach(ws, deploymentId, container);
    });
  });
}

void bootstrap();
