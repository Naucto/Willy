import { Controller, Get, HttpCode, Ip, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { AuditService } from "../audit/audit.service";
import { OkResponseDto } from "../common/dto/ok.dto";
import { DeploymentsService } from "../deployments/deployments.service";
import { ContainersService } from "../containers/containers.service";
import { BackupsService } from "./backups.service";
import { ContainerDto } from "./dto/backup.dto";

@ApiTags("deployments")
@ApiBearerAuth()
@ApiParam({ name: "id", type: String })
@Controller("deployments")
export class DeploymentVolumesController {
  constructor(
    private readonly deployments: DeploymentsService,
    private readonly containers: ContainersService,
    private readonly backups: BackupsService,
    private readonly audit: AuditService,
  ) {}

  @ApiOkResponse({ type: [ContainerDto] })
  @Get(":id/containers")
  async list(@Param("id") id: string): Promise<ContainerDto[]> {
    const deployment = await this.deployments.findById(id);

    if (!deployment) {
      throw new NotFoundException("deployment not found");
    }

    return this.containers.listForDeployment(deployment);
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @ApiParam({ name: "name", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Post(":id/volumes/:name/reset")
  async reset(
    @Param("id") id: string,
    @Param("name") name: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    await this.backups.resetVolume(id, name, user.userId);
    await this.audit.record({
      actorId: user.userId,
      action: "VOLUME_RESET",
      targetType: "volume",
      targetId: name,
      ip,
      metadata: { deploymentId: id },
    });

    return { ok: true };
  }
}
