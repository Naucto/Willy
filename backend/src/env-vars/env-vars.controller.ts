import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  Patch,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AuditService } from "../audit/audit.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { MaskedEnvVarDto } from "./dto/masked-env-var.dto";
import { SetEnvVarDto } from "./dto/set-env-var.dto";
import { UpdateEnvVarMetaDto } from "./dto/update-env-var-meta.dto";
import { type MaskedEnvVar, EnvVarsService } from "./env-vars.service";

@ApiTags("env")
@ApiBearerAuth()
@ApiParam({ name: "id", type: String })
@Controller("deployments/:id/env")
export class EnvVarsController {
  constructor(
    private readonly envVars: EnvVarsService,
    private readonly audit: AuditService,
  ) {}

  // Env-var mutations are audited as ENV_CHANGE; values are never recorded, only the key + operation.
  private auditChange(
    actor: AuthUser,
    deploymentId: string,
    ip: string,
    meta: Record<string, unknown>,
  ): void {
    void this.audit.record({
      actorId: actor.userId,
      action: "ENV_CHANGE",
      targetType: "deployment",
      targetId: deploymentId,
      ip,
      metadata: meta,
    });
  }

  @ApiOkResponse({ type: [MaskedEnvVarDto] })
  @ApiQuery({ name: "service", required: false, type: String })
  @Get()
  list(
    @Param("id") deploymentId: string,
    @Query("service") service?: string,
  ): Promise<MaskedEnvVar[]> {
    return this.envVars.listMasked(deploymentId, service ?? "");
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(204)
  @ApiParam({ name: "key", type: String })
  @ApiQuery({ name: "service", required: false, type: String })
  @ApiBody({ type: SetEnvVarDto })
  @ApiNoContentResponse()
  @Put(":key")
  async set(
    @Param("id") deploymentId: string,
    @Param("key") key: string,
    @Body() dto: SetEnvVarDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
    @Query("service") service?: string,
  ): Promise<void> {
    await this.envVars.set(deploymentId, key, dto.value, {
      scope: dto.scope,
      isSecret: dto.isSecret,
      targetService: service ?? "",
    });
    this.auditChange(actor, deploymentId, ip, { key, service: service ?? "", op: "set" });
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(204)
  @ApiParam({ name: "key", type: String })
  @ApiQuery({ name: "service", required: false, type: String })
  @ApiBody({ type: UpdateEnvVarMetaDto })
  @ApiNoContentResponse()
  @Patch(":key")
  async updateMeta(
    @Param("id") deploymentId: string,
    @Param("key") key: string,
    @Body() dto: UpdateEnvVarMetaDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
    @Query("service") service?: string,
  ): Promise<void> {
    await this.envVars.updateMeta(deploymentId, key, service ?? "", {
      scope: dto.scope,
      isSecret: dto.isSecret,
    });
    this.auditChange(actor, deploymentId, ip, { key, service: service ?? "", op: "update_meta" });
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(204)
  @ApiParam({ name: "key", type: String })
  @ApiQuery({ name: "service", required: false, type: String })
  @ApiNoContentResponse()
  @Delete(":key")
  async remove(
    @Param("id") deploymentId: string,
    @Param("key") key: string,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
    @Query("service") service?: string,
  ): Promise<void> {
    await this.envVars.delete(deploymentId, key, service ?? "");
    this.auditChange(actor, deploymentId, ip, { key, service: service ?? "", op: "delete" });
  }
}
