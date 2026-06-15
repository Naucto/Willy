import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { OkResponseDto } from "../common/dto/ok.dto";
import { type Backup, BackupsService } from "./backups.service";
import { BackupDto, CreateBackupDto, VolumesDto } from "./dto/backup.dto";

function toDto(row: Backup): BackupDto {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    kind: row.kind,
    status: row.status,
    target: row.target,
    sizeBytes: row.sizeBytes,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

@ApiTags("backups")
@ApiBearerAuth()
@Controller("backups")
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @ApiOkResponse({ type: [BackupDto] })
  @Get()
  async list(): Promise<BackupDto[]> {
    return (await this.backups.list()).map(toDto);
  }

  @ApiOkResponse({ type: VolumesDto })
  @Get("volumes")
  async volumes(): Promise<VolumesDto> {
    return { volumes: await this.backups.listVolumes() };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: CreateBackupDto })
  @ApiOkResponse({ type: BackupDto })
  @Post()
  async create(@Body() dto: CreateBackupDto): Promise<BackupDto> {
    return toDto(
      await this.backups.create({
        kind: dto.kind,
        target: dto.target,
        ...(dto.deploymentId ? { deploymentId: dto.deploymentId } : {}),
      }),
    );
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Post(":id/restore")
  async restore(@Param("id", ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.backups.restore(id);

    return { ok: true };
  }

  @ApiParam({ name: "id", type: String })
  @Get(":id/download")
  async download(@Param("id", ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const { stream, filename } = await this.backups.openDownload(id);

    return new StreamableFile(stream, {
      type: "application/gzip",
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(200)
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete(":id")
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.backups.remove(id);

    return { ok: true };
  }
}
