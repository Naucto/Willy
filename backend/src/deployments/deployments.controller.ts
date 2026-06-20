import {
  BadRequestException,
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
import { SettingsService } from "../admin/settings.service";
import { Roles } from "../auth/decorators/roles.decorator";
import { OkResponseDto } from "../common/dto/ok.dto";
import { DomainProvisioningService } from "../domains/domain-provisioning.service";
import {
  type Domain,
  type DeploymentView,
  DeploymentsService,
  type PortBinding,
} from "./deployments.service";
import { CreateDeploymentDto } from "./dto/create-deployment.dto";
import { DeploymentDto } from "./dto/deployment.dto";
import { AddDomainDto, DomainDto, UpdateDomainTargetDto } from "./dto/domain.dto";
import {
  AddPortBindingDto,
  PortBindingDto,
  SuggestPortDto,
  UpdatePortBindingDto,
} from "./dto/port-binding.dto";
import { ResourceLimitsDto } from "./dto/resource-limits.dto";
import { UpdateDeploymentDto } from "./dto/update-deployment.dto";

function domainToDto(row: Domain): DomainDto {
  return {
    id: row.id,
    fqdn: row.fqdn,
    isPrimary: row.isPrimary,
    targetService: row.targetService,
    targetPort: row.targetPort,
  };
}

function bindingToDto(row: PortBinding): PortBindingDto {
  return {
    id: row.id,
    domainId: row.domainId,
    hostPort: row.hostPort,
    targetService: row.targetService,
    targetPort: row.targetPort,
  };
}

@ApiTags("deployments")
@ApiBearerAuth()
@Controller("deployments")
export class DeploymentsController {
  constructor(
    private readonly deployments: DeploymentsService,
    private readonly domainProvisioning: DomainProvisioningService,
    private readonly settings: SettingsService,
  ) {}

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: CreateDeploymentDto })
  @ApiCreatedResponse({ type: DeploymentDto })
  @Post()
  async create(@Body() dto: CreateDeploymentDto): Promise<DeploymentView> {
    const created = await this.deployments.create(dto);

    if (dto.domain) {
      await this.domainProvisioning.provision(created.id, dto.domain.trim());
    }

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
    const fqdn = dto.fqdn.trim();
    // Reject domains outside the OVH perimeter before persisting (OVH provider only).
    await this.domainProvisioning.assertInPerimeter(fqdn);

    const domain = await this.deployments.addDomain(id, {
      fqdn,
      targetService: dto.targetService?.trim() || null,
      targetPort: dto.targetPort ?? null,
    });

    // Auto-create the A record + flag the cert pending (Traefik issues it on the next deploy).
    await this.domainProvisioning.provision(id, fqdn);

    return domainToDto(domain);
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "domainId", type: String })
  @ApiBody({ type: UpdateDomainTargetDto })
  @ApiOkResponse({ type: DomainDto })
  @Patch(":id/domains/:domainId")
  async updateDomainTarget(
    @Param("id") id: string,
    @Param("domainId", ParseUUIDPipe) domainId: string,
    @Body() dto: UpdateDomainTargetDto,
  ): Promise<DomainDto> {
    return domainToDto(
      await this.deployments.updateDomainTarget(id, domainId, {
        targetService: dto.targetService?.trim() || null,
        targetPort: dto.targetPort ?? null,
      }),
    );
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
    // Capture the fqdn before deletion so the managed A record can be torn down too.
    const domain = (await this.deployments.listDomains(id)).find((row) => row.id === domainId);
    await this.deployments.removeDomain(id, domainId);

    if (domain) {
      await this.domainProvisioning.deprovision(domain.fqdn);
    }

    return { ok: true };
  }

  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "domainId", type: String })
  @ApiOkResponse({ type: [PortBindingDto] })
  @Get(":id/domains/:domainId/bindings")
  async portBindings(
    @Param("id") id: string,
    @Param("domainId", ParseUUIDPipe) domainId: string,
  ): Promise<PortBindingDto[]> {
    await this.requireDomain(id, domainId);

    return (await this.deployments.listPortBindings(domainId)).map(bindingToDto);
  }

  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "domainId", type: String })
  @ApiOkResponse({ type: SuggestPortDto })
  @Get(":id/domains/:domainId/bindings/suggest")
  async suggestPortBinding(
    @Param("id") id: string,
    @Param("domainId", ParseUUIDPipe) domainId: string,
  ): Promise<SuggestPortDto> {
    await this.requireDomain(id, domainId);
    const range = await this.activeRange();

    return { hostPort: await this.deployments.suggestFreePort(range) };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "domainId", type: String })
  @ApiBody({ type: AddPortBindingDto })
  @ApiCreatedResponse({ type: PortBindingDto })
  @Post(":id/domains/:domainId/bindings")
  async addPortBinding(
    @Param("id") id: string,
    @Param("domainId", ParseUUIDPipe) domainId: string,
    @Body() dto: AddPortBindingDto,
  ): Promise<PortBindingDto> {
    await this.requireDomain(id, domainId);
    await this.assertHostPortInRange(dto.hostPort);

    return bindingToDto(
      await this.deployments.addPortBinding(domainId, {
        hostPort: dto.hostPort,
        targetService: dto.targetService?.trim() || null,
        targetPort: dto.targetPort ?? null,
      }),
    );
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "domainId", type: String })
  @ApiParam({ name: "bindingId", type: String })
  @ApiBody({ type: UpdatePortBindingDto })
  @ApiOkResponse({ type: PortBindingDto })
  @Patch(":id/domains/:domainId/bindings/:bindingId")
  async updatePortBinding(
    @Param("id") id: string,
    @Param("domainId", ParseUUIDPipe) domainId: string,
    @Param("bindingId", ParseUUIDPipe) bindingId: string,
    @Body() dto: UpdatePortBindingDto,
  ): Promise<PortBindingDto> {
    await this.requireDomain(id, domainId);
    await this.assertHostPortInRange(dto.hostPort);

    return bindingToDto(
      await this.deployments.updatePortBinding(domainId, bindingId, {
        hostPort: dto.hostPort,
        targetService: dto.targetService?.trim() || null,
        targetPort: dto.targetPort ?? null,
      }),
    );
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "domainId", type: String })
  @ApiParam({ name: "bindingId", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete(":id/domains/:domainId/bindings/:bindingId")
  async removePortBinding(
    @Param("id") id: string,
    @Param("domainId", ParseUUIDPipe) domainId: string,
    @Param("bindingId", ParseUUIDPipe) bindingId: string,
  ): Promise<{ ok: true }> {
    await this.requireDomain(id, domainId);
    await this.deployments.removePortBinding(domainId, bindingId);

    return { ok: true };
  }

  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "service", type: String })
  @ApiOkResponse({ type: ResourceLimitsDto })
  @Get(":id/services/:service/resources")
  async serviceResources(
    @Param("id") id: string,
    @Param("service") service: string,
  ): Promise<ResourceLimitsDto> {
    const deployment = await this.requireForApi(id);

    return deployment.serviceResources?.[service] ?? {};
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "service", type: String })
  @ApiBody({ type: ResourceLimitsDto })
  @ApiOkResponse({ type: ResourceLimitsDto })
  @Patch(":id/services/:service/resources")
  async setServiceResources(
    @Param("id") id: string,
    @Param("service") service: string,
    @Body() dto: ResourceLimitsDto,
  ): Promise<ResourceLimitsDto> {
    const updated = await this.deployments.updateServiceResources(id, service, dto);

    return updated.serviceResources?.[service] ?? {};
  }

  private async requireDomain(deploymentId: string, domainId: string): Promise<Domain> {
    const domain = await this.deployments.findDomain(deploymentId, domainId);

    if (!domain) {
      throw new NotFoundException("domain not found for this deployment");
    }

    return domain;
  }

  // The active allocatable sub-range, after confirming the feature is provisioned + enabled.
  private async activeRange(): Promise<{ start: number; end: number }> {
    const settings = await this.settings.getAll();

    if (!settings.portBinding.enabled) {
      throw new BadRequestException("host-port binding is disabled in settings");
    }

    return { start: settings.portBinding.start, end: settings.portBinding.end };
  }

  private async assertHostPortInRange(hostPort: number): Promise<void> {
    const { start, end } = await this.activeRange();

    if (hostPort < start || hostPort > end) {
      throw new BadRequestException(`host port must be within the active range ${start}-${end}`);
    }
  }

  private async requireForApi(id: string): Promise<DeploymentView> {
    const deployment = await this.deployments.findByIdForApi(id);

    if (!deployment) {
      throw new NotFoundException("deployment not found");
    }

    return deployment;
  }
}
