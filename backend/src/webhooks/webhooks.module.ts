import { Module } from "@nestjs/common";
import { BuildModule } from "../build/build.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

@Module({
  imports: [DeploymentsModule, BuildModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
