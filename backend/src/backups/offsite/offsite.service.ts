import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DockerContainerService } from "../../docker/docker-container.service";
import type { DestinationConfig, DestinationType } from "../destinations.service";
import { FtpOffsiteDriver, SftpOffsiteDriver } from "./curl.driver";
import { OffsiteError, type OffsiteDriver } from "./offsite-driver";
import { S3OffsiteDriver } from "./s3.driver";
import { SshOffsiteDriver } from "./ssh.driver";

// Registry over the OffsiteDriver implementations — resolves one by destination type.
@Injectable()
export class OffsiteService {
  private readonly drivers: Map<DestinationType, OffsiteDriver>;

  constructor(dockerContainers: DockerContainerService, config: ConfigService) {
    const volume = config.get<string>("BACKUPS_VOLUME") ?? "willy_backups";
    // Helpers join this network so destinations reachable on a Willy network (e.g. a dev FTP
    // container) resolve by name; it still has egress, so external destinations keep working.
    const network = config.get<string>("BACKUPS_NETWORK") ?? "willy_internal";
    const drivers: OffsiteDriver[] = [
      new S3OffsiteDriver(dockerContainers, volume, network),
      new FtpOffsiteDriver(dockerContainers, volume, network),
      new SftpOffsiteDriver(dockerContainers, volume, network),
      new SshOffsiteDriver(dockerContainers, volume, network),
    ];

    this.drivers = new Map(drivers.map((driver) => [driver.type, driver]));
  }

  test(type: DestinationType, config: DestinationConfig): Promise<void> {
    return this.driver(type).test(config);
  }

  push(type: DestinationType, file: string, config: DestinationConfig): Promise<string> {
    return this.driver(type).push(file, config);
  }

  private driver(type: DestinationType): OffsiteDriver {
    const driver = this.drivers.get(type);

    if (!driver) {
      throw new OffsiteError(`No offsite driver for ${type}`);
    }

    return driver;
  }
}
