import { ConfigService } from "@nestjs/config";
import Docker from "dockerode";

// Shared dockerode client, reached through the least-privilege docker-socket-proxy (never the raw
// socket). The focused Docker* services inject this single instance under the DOCKER_CLIENT token.
export const DOCKER_CLIENT = Symbol("DOCKER_CLIENT");

export const dockerClientProvider = {
  provide: DOCKER_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Docker =>
    new Docker({
      host: config.get<string>("DOCKER_PROXY_HOST") ?? "docker-socket-proxy",
      port: config.get<number>("DOCKER_PROXY_PORT") ?? 2375,
      protocol: "http",
    }),
};
