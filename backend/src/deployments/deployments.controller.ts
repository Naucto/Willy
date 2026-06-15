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
import { type Deployment, DeploymentsService } from "./deployments.service";
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
  create(@Body() dto: CreateDeploymentDto): Promise<Deployment> {
    return this.deployments.create(dto);
  }

  @ApiOkResponse({ type: [DeploymentDto] })
  @Get()
  list(): Promise<Deployment[]> {
    return this.deployments.findAll();
  }

  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: DeploymentDto })
  @Get(":id")
  async get(@Param("id") id: string): Promise<Deployment> {
    const deployment = await this.deployments.findById(id);

    if (!deployment) {
      throw new NotFoundException("deployment not found");
    }

    return deployment;
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiBody({ type: UpdateDeploymentDto })
  @ApiOkResponse({ type: DeploymentDto })
  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateDeploymentDto): Promise<Deployment> {
    const existing = await this.deployments.findById(id);

    if (!existing) {
      throw new NotFoundException("deployment not found");
    }

    return this.deployments.update(id, dto);
  }
}
