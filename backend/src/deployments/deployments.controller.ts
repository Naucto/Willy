import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { OkResponseDto } from "../common/dto/ok.dto";
import { type Domain, type DeploymentView, DeploymentsService } from "./deployments.service";
import { CreateDeploymentDto } from "./dto/create-deployment.dto";
import { DeploymentDto } from "./dto/deployment.dto";
import { AddDomainDto, DomainDto } from "./dto/domain.dto";
import { UpdateDeploymentDto } from "./dto/update-deployment.dto";

function domainToDto(row: Domain): DomainDto {
  return { id: row.id, fqdn: row.fqdn, isPrimary: row.isPrimary };
}

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

  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: [DomainDto] })
  @Get(":id/domains")
  async domains(@Param("id") id: string): Promise<DomainDto[]> {
    return (await this.deployments.listDomains(id)).map(domainToDto);
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiBody({ type: AddDomainDto })
  @ApiCreatedResponse({ type: DomainDto })
  @Post(":id/domains")
  async addDomain(@Param("id") id: string, @Body() dto: AddDomainDto): Promise<DomainDto> {
    return domainToDto(await this.deployments.addDomain(id, dto.fqdn.trim()));
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(200)
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "domainId", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Patch(":id/domains/:domainId/primary")
  async makeDomainPrimary(
    @Param("id") id: string,
    @Param("domainId", ParseUUIDPipe) domainId: string,
  ): Promise<{ ok: true }> {
    await this.deployments.makePrimary(id, domainId);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "domainId", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete(":id/domains/:domainId")
  async removeDomain(
    @Param("id") id: string,
    @Param("domainId", ParseUUIDPipe) domainId: string,
  ): Promise<{ ok: true }> {
    await this.deployments.removeDomain(id, domainId);

    return { ok: true };
  }

  private async requireForApi(id: string): Promise<DeploymentView> {
    const deployment = await this.deployments.findByIdForApi(id);

    if (!deployment) {
      throw new NotFoundException("deployment not found");
    }

    return deployment;
  }
}
