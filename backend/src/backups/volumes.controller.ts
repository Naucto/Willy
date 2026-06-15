import { Controller, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
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
  async reset(@Param("id") id: string, @Param("name") name: string): Promise<{ ok: true }> {
    await this.backups.resetVolume(id, name);

    return { ok: true };
  }
}
