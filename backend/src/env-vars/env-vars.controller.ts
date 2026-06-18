import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Put, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { MaskedEnvVarDto } from "./dto/masked-env-var.dto";
import { SetEnvVarDto } from "./dto/set-env-var.dto";
import { UpdateEnvVarMetaDto } from "./dto/update-env-var-meta.dto";
import { type MaskedEnvVar, EnvVarsService } from "./env-vars.service";

@ApiTags("env")
@ApiBearerAuth()
@ApiParam({ name: "id", type: String })
@Controller("deployments/:id/env")
export class EnvVarsController {
  constructor(private readonly envVars: EnvVarsService) {}

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
    @Query("service") service?: string,
  ): Promise<void> {
    await this.envVars.set(deploymentId, key, dto.value, {
      scope: dto.scope,
      isSecret: dto.isSecret,
      targetService: service ?? "",
    });
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
    @Query("service") service?: string,
  ): Promise<void> {
    await this.envVars.updateMeta(deploymentId, key, service ?? "", {
      scope: dto.scope,
      isSecret: dto.isSecret,
    });
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
    @Query("service") service?: string,
  ): Promise<void> {
    await this.envVars.delete(deploymentId, key, service ?? "");
  }
}
