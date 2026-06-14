import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Docker from "dockerode";

// Thin wrapper over the Docker Engine API, reached through the least-privilege
// docker-socket-proxy (never the raw socket). Grows in later phases (build/run/exec/logs).
@Injectable()
export class DockerService {
  private readonly docker: Docker;
  private readonly logger = new Logger(DockerService.name);

  constructor(config: ConfigService) {
    this.docker = new Docker({
      host: config.get<string>("DOCKER_PROXY_HOST") ?? "docker-socket-proxy",
      port: config.get<number>("DOCKER_PROXY_PORT") ?? 2375,
      protocol: "http",
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();

      return true;
    } catch (error) {
      this.logger.warn(
        `docker ping failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return false;
    }
  }
}
