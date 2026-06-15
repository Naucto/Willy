import { Module } from "@nestjs/common";
import { BuildModule } from "../build/build.module";
import { ContainersModule } from "../containers/containers.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { LogsController } from "./logs.controller";

@Module({
  imports: [BuildModule, DeploymentsModule, ContainersModule],
  controllers: [LogsController],
})
export class LogsModule {}
