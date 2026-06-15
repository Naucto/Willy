import { Body, Controller, Delete, Get, HttpCode, Param, Put } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { SetEnvVarDto } from "./dto/set-env-var.dto";
import { MaskedEnvVarDto } from "./dto/masked-env-var.dto";
import { type MaskedEnvVar, EnvVarsService } from "./env-vars.service";

@ApiTags("env")
@ApiBearerAuth()
@ApiParam({ name: "id", type: String })
@Controller("deployments/:id/env")
export class EnvVarsController {
  constructor(private readonly envVars: EnvVarsService) {}

  @ApiOkResponse({ type: [MaskedEnvVarDto] })
  @Get()
  list(@Param("id") deploymentId: string): Promise<MaskedEnvVar[]> {
    return this.envVars.listMasked(deploymentId);
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(204)
  @ApiParam({ name: "key", type: String })
  @ApiBody({ type: SetEnvVarDto })
  @ApiNoContentResponse()
  @Put(":key")
  async set(
    @Param("id") deploymentId: string,
    @Param("key") key: string,
    @Body() dto: SetEnvVarDto,
  ): Promise<void> {
    await this.envVars.set(deploymentId, key, dto.value, {
      scope: dto.scope,
      isSecret: dto.isSecret,
    });
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(204)
  @ApiParam({ name: "key", type: String })
  @ApiNoContentResponse()
  @Delete(":key")
  async remove(@Param("id") deploymentId: string, @Param("key") key: string): Promise<void> {
    await this.envVars.delete(deploymentId, key);
  }
}
