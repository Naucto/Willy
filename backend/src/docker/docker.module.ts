import { Global, Module } from "@nestjs/common";
import { dockerClientProvider } from "./docker-client";
import { DockerContainerService } from "./docker-container.service";
import { DockerImageService } from "./docker-image.service";
import { DockerLogService } from "./docker-log.service";
import { DockerSystemService } from "./docker-system.service";

@Global()
@Module({
  providers: [
    dockerClientProvider,
    DockerImageService,
    DockerContainerService,
    DockerSystemService,
    DockerLogService,
  ],
  exports: [DockerImageService, DockerContainerService, DockerSystemService, DockerLogService],
})
export class DockerModule {}
