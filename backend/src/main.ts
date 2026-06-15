import "reflect-metadata";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { WebSocketServer } from "ws";
import { AppModule } from "./app.module";
import { ConsoleService } from "./console/console.service";

const CONSOLE_PATH = /^\/api\/console\/([^/]+)$/;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Health probes stay un-prefixed so the container healthcheck can hit /health directly.
  app.setGlobalPrefix("api", { exclude: ["health", "health/ready"] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Willy API")
    .setVersion("0.0.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));

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

    if (!consoleService.verifyTicket(url.searchParams.get("ticket") ?? "")) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();

      return;
    }

    const container = url.searchParams.get("container") ?? undefined;

    wss.handleUpgrade(req, socket, head, (ws) => {
      void consoleService.attach(ws, match[1] as string, container);
    });
  });
}

void bootstrap();
