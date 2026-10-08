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

// Where the docker CLI reaches the engine: the same socket-proxy, over TCP.
export function dockerProxyUrl(config: ConfigService): string {
  const host = config.get<string>("DOCKER_PROXY_HOST") ?? "docker-socket-proxy";
  const port = config.get<number>("DOCKER_PROXY_PORT") ?? 2375;

  return `tcp://${host}:${port}`;
}

// Environment for a docker CLI child process. The caller's extras never override where the engine
// is, and BuildKit's plain progress keeps the build log one readable line per step instead of a
// redrawn terminal.
export function dockerCliEnv(
  dockerHost: string,
  extraEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...extraEnv,
    DOCKER_HOST: dockerHost,
    BUILDKIT_PROGRESS: "plain",
  };
}
