import { Module } from "@nestjs/common";
import { BuildModule } from "../build/build.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { DockerModule } from "../docker/docker.module";
import { ReconcileService } from "./reconcile.service";

@Module({
  imports: [BuildModule, DeploymentsModule, DockerModule],
  providers: [ReconcileService],
})
export class ReconcileModule {}
