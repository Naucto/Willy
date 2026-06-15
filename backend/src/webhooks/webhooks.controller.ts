import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  type RawBodyRequest,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { WebhookSecretDto, WebhookStatusDto } from "./dto/webhook.dto";
import { type WebhookOutcome, WebhooksService } from "./webhooks.service";

function webhookPath(deploymentId: string): string {
  return `/api/webhooks/github/${deploymentId}`;
}

@ApiTags("webhooks")
@Controller()
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  // Called by GitHub, not the panel — authenticated by the HMAC signature, not a JWT.
  @Public()
  @ApiExcludeEndpoint()
  @HttpCode(202)
  @Post("webhooks/github/:id")
  github(
    @Param("id") id: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Headers("x-github-event") event: string | undefined,
  ): Promise<WebhookOutcome> {
    return this.webhooks.handlePush(
      id,
      signature ?? "",
      event ?? "",
      req.rawBody ?? Buffer.alloc(0),
    );
  }

  @ApiBearerAuth()
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: WebhookStatusDto })
  @Get("deployments/:id/webhook")
  async status(@Param("id") id: string): Promise<WebhookStatusDto> {
    return { configured: await this.webhooks.isConfigured(id), path: webhookPath(id) };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiBearerAuth()
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: WebhookSecretDto })
  @Post("deployments/:id/webhook")
  async rotate(@Param("id") id: string): Promise<WebhookSecretDto> {
    return { secret: await this.webhooks.rotateSecret(id), path: webhookPath(id) };
  }
}
