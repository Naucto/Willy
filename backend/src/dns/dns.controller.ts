import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { OkResponseDto } from "../common/dto/ok.dto";
import { DnsProvider } from "./dns-provider";
import {
  CreateDnsRecordDto,
  DnsRecordDto,
  RegisterZoneDto,
  UpdateDnsRecordDto,
  ZonesDto,
} from "./dto/dns.dto";
import { ManagedZonesService, ZonesService } from "./zones.service";

@ApiTags("dns")
@ApiBearerAuth()
@Controller("dns")
export class DnsController {
  constructor(
    private readonly dns: DnsProvider,
    private readonly zonesService: ZonesService,
    private readonly managedZones: ManagedZonesService,
  ) {}

  // Discovered ∪ operator-registered zones. Available even when the provider can't list zones.
  @ApiOkResponse({ type: ZonesDto })
  @Get("zones")
  async zones(): Promise<ZonesDto> {
    return { zones: await this.zonesService.all() };
  }

  // Register a zone for Willy to manage (config surface, separate from the records view).
  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: RegisterZoneDto })
  @ApiOkResponse({ type: ZonesDto })
  @Post("zones")
  async registerZone(@Body() dto: RegisterZoneDto): Promise<ZonesDto> {
    await this.managedZones.add(dto.zone.trim().toLowerCase());

    return { zones: await this.zonesService.all() };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "zone", type: String })
  @ApiOkResponse({ type: ZonesDto })
  @Delete("zones/:zone")
  async unregisterZone(@Param("zone") zone: string): Promise<ZonesDto> {
    await this.managedZones.remove(zone.trim().toLowerCase());

    return { zones: await this.zonesService.all() };
  }

  @ApiParam({ name: "zone", type: String })
  @ApiOkResponse({ type: [DnsRecordDto] })
  @Get("zones/:zone/records")
  records(@Param("zone") zone: string): Promise<DnsRecordDto[]> {
    this.ensureConfigured();

    return this.dns.records(zone);
  }

  private ensureConfigured(): void {
    if (!this.dns.configured) {
      throw new ServiceUnavailableException(
        "OVH API is not configured (set OVH_APPLICATION_KEY / SECRET / CONSUMER_KEY)",
      );
    }
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "zone", type: String })
  @ApiBody({ type: CreateDnsRecordDto })
  @ApiOkResponse({ type: DnsRecordDto })
  @Post("zones/:zone/records")
  create(@Param("zone") zone: string, @Body() dto: CreateDnsRecordDto): Promise<DnsRecordDto> {
    this.ensureConfigured();

    return this.dns.create(zone, dto);
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(200)
  @ApiParam({ name: "zone", type: String })
  @ApiParam({ name: "id", type: Number })
  @ApiBody({ type: UpdateDnsRecordDto })
  @ApiOkResponse({ type: OkResponseDto })
  @Put("zones/:zone/records/:id")
  async update(
    @Param("zone") zone: string,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateDnsRecordDto,
  ): Promise<{ ok: true }> {
    this.ensureConfigured();
    await this.dns.update(zone, id, dto);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "zone", type: String })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete("zones/:zone/records/:id")
  async remove(
    @Param("zone") zone: string,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<{ ok: true }> {
    this.ensureConfigured();
    await this.dns.remove(zone, id);

    return { ok: true };
  }
}
