import { Module } from "@nestjs/common";
import { ContainersModule } from "../containers/containers.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

// Browse/edit a deployment's volume files. DockerModule (VolumeHelperService) and AuditModule are
// global; container/deployment discovery comes from the imported modules.
@Module({
  imports: [DeploymentsModule, ContainersModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
