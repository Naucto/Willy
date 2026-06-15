import { Module } from "@nestjs/common";
import { BuildModule } from "../build/build.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { LogsController } from "./logs.controller";

@Module({
  imports: [BuildModule, DeploymentsModule],
  controllers: [LogsController],
})
export class LogsModule {}
