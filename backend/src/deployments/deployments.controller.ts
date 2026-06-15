import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { type DeploymentView, DeploymentsService } from "./deployments.service";
import { CreateDeploymentDto } from "./dto/create-deployment.dto";
import { DeploymentDto } from "./dto/deployment.dto";
import { UpdateDeploymentDto } from "./dto/update-deployment.dto";

@ApiTags("deployments")
@ApiBearerAuth()
@Controller("deployments")
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: CreateDeploymentDto })
  @ApiCreatedResponse({ type: DeploymentDto })
  @Post()
  async create(@Body() dto: CreateDeploymentDto): Promise<DeploymentView> {
    const created = await this.deployments.create(dto);

    return this.requireForApi(created.id);
  }

  @ApiOkResponse({ type: [DeploymentDto] })
  @Get()
  list(): Promise<DeploymentView[]> {
    return this.deployments.findAllForApi();
  }

  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: DeploymentDto })
  @Get(":id")
  get(@Param("id") id: string): Promise<DeploymentView> {
    return this.requireForApi(id);
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiBody({ type: UpdateDeploymentDto })
  @ApiOkResponse({ type: DeploymentDto })
  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateDeploymentDto): Promise<DeploymentView> {
    await this.requireForApi(id);
    await this.deployments.update(id, dto);

    return this.requireForApi(id);
  }

  private async requireForApi(id: string): Promise<DeploymentView> {
    const deployment = await this.deployments.findByIdForApi(id);

    if (!deployment) {
      throw new NotFoundException("deployment not found");
    }

    return deployment;
  }
}
