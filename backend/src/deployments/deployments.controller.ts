import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { type Deployment, DeploymentsService } from "./deployments.service";
import { CreateDeploymentDto } from "./dto/create-deployment.dto";

@Controller("deployments")
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Roles("ADMIN", "OPERATOR")
  @Post()
  create(@Body() dto: CreateDeploymentDto): Promise<Deployment> {
    return this.deployments.create(dto);
  }

  @Get()
  list(): Promise<Deployment[]> {
    return this.deployments.findAll();
  }

  @Get(":id")
  async get(@Param("id") id: string): Promise<Deployment> {
    const deployment = await this.deployments.findById(id);

    if (!deployment) {
      throw new NotFoundException("deployment not found");
    }

    return deployment;
  }
}
