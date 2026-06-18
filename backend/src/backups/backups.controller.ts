import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { AuditService } from "../audit/audit.service";
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
    offsiteUrl: row.offsiteUrl,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

@ApiTags("backups")
@ApiBearerAuth()
@Controller("backups")
export class BackupsController {
  constructor(
    private readonly backups: BackupsService,
    private readonly audit: AuditService,
  ) {}

  @ApiQuery({ name: "deploymentId", required: false, type: String })
  @ApiOkResponse({ type: [BackupDto] })
  @Get()
  async list(@Query("deploymentId") deploymentId?: string): Promise<BackupDto[]> {
    return (await this.backups.list(deploymentId)).map(toDto);
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
  async create(
    @Body() dto: CreateBackupDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<BackupDto> {
    const backup = await this.backups.create({
      kind: dto.kind,
      target: dto.target,
      actorId: user.userId,
      ...(dto.deploymentId ? { deploymentId: dto.deploymentId } : {}),
    });

    await this.audit.record({
      actorId: user.userId,
      action: "BACKUP_CREATE",
      targetType: "volume",
      targetId: dto.target,
      ip,
      ...(dto.deploymentId ? { metadata: { deploymentId: dto.deploymentId } } : {}),
    });

    return toDto(backup);
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Post(":id/restore")
  async restore(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    await this.backups.restore(id, user.userId);
    await this.audit.record({
      actorId: user.userId,
      action: "RESTORE",
      targetType: "backup",
      targetId: id,
      ip,
    });

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "destinationId", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Post(":id/push/:destinationId")
  async push(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("destinationId", ParseUUIDPipe) destinationId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    await this.backups.pushOffsite(id, destinationId, user.userId);
    await this.audit.record({
      actorId: user.userId,
      action: "OFFSITE_PUSH",
      targetType: "backup",
      targetId: id,
      ip,
      metadata: { destinationId },
    });

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
