import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { OkResponseDto } from "../common/dto/ok.dto";
import { BackupDestinationDto, CreateBackupDestinationDto } from "./dto/backup.dto";
import { type DestinationRow, BackupDestinationsService } from "./destinations.service";

// Only non-secret fields are returned — the connection config stays sealed.
function toDto(row: DestinationRow): BackupDestinationDto {
  return { id: row.id, name: row.name, type: row.type, createdAt: row.createdAt.toISOString() };
}

@ApiTags("backups")
@ApiBearerAuth()
@Controller("backups/destinations")
export class BackupDestinationsController {
  constructor(private readonly destinations: BackupDestinationsService) {}

  @ApiOkResponse({ type: [BackupDestinationDto] })
  @Get()
  async list(): Promise<BackupDestinationDto[]> {
    return (await this.destinations.list()).map(toDto);
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: CreateBackupDestinationDto })
  @ApiOkResponse({ type: BackupDestinationDto })
  @Post()
  async create(@Body() dto: CreateBackupDestinationDto): Promise<BackupDestinationDto> {
    const { name, type, ...config } = dto;

    return toDto(await this.destinations.create({ name, type, config }));
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete(":id")
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.destinations.remove(id);

    return { ok: true };
  }
}
