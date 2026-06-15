import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { OkResponseDto } from "../common/dto/ok.dto";
import { BackupsService } from "./backups.service";
import {
  type DestinationConfig,
  type DestinationRow,
  BackupDestinationsService,
} from "./destinations.service";
import { BackupDestinationDto, CreateBackupDestinationDto } from "./dto/backup.dto";

// Only non-secret fields are returned — the connection config stays sealed.
function toDto(row: DestinationRow): BackupDestinationDto {
  return { id: row.id, name: row.name, type: row.type, createdAt: row.createdAt.toISOString() };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@ApiTags("backups")
@ApiBearerAuth()
@Controller("backups/destinations")
export class BackupDestinationsController {
  constructor(
    private readonly destinations: BackupDestinationsService,
    private readonly backups: BackupsService,
  ) {}

  @ApiOkResponse({ type: [BackupDestinationDto] })
  @Get()
  async list(): Promise<BackupDestinationDto[]> {
    return (await this.destinations.list()).map(toDto);
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(200)
  @ApiBody({ type: CreateBackupDestinationDto })
  @ApiOkResponse({ type: OkResponseDto })
  @Post("test")
  async test(@Body() dto: CreateBackupDestinationDto): Promise<{ ok: true }> {
    const { type, ...raw } = dto;
    await this.validate(type, raw);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: CreateBackupDestinationDto })
  @ApiOkResponse({ type: BackupDestinationDto })
  @Post()
  async create(@Body() dto: CreateBackupDestinationDto): Promise<BackupDestinationDto> {
    const { name, type, ...raw } = dto;
    const config = await this.validate(type, raw);

    return toDto(await this.destinations.create(name, type, config));
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete(":id")
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.destinations.remove(id);

    return { ok: true };
  }

  // Normalise the config and verify the connection before persisting — surfaced as a 400.
  private async validate(
    type: CreateBackupDestinationDto["type"],
    raw: Record<string, unknown>,
  ): Promise<DestinationConfig> {
    let config: DestinationConfig;

    try {
      config = this.destinations.buildConfig(type, raw);
    } catch (error) {
      throw new BadRequestException(describe(error));
    }

    try {
      await this.backups.testConnection(type, config);
    } catch (error) {
      throw new BadRequestException(`Connection test failed: ${describe(error)}`);
    }

    return config;
  }
}
