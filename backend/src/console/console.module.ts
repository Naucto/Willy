import { Module } from "@nestjs/common";
import { BuildModule } from "../build/build.module";
import { ContainersModule } from "../containers/containers.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { ConsoleController } from "./console.controller";
import { ConsoleService } from "./console.service";

@Module({
  imports: [DeploymentsModule, BuildModule, ContainersModule],
  controllers: [ConsoleController],
  providers: [ConsoleService],
  exports: [ConsoleService],
})
export class ConsoleModule {}
