import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { OkResponseDto } from "../common/dto/ok.dto";
import {
  BackupScheduleDto,
  CreateBackupScheduleDto,
  UpdateBackupScheduleDto,
} from "./dto/backup.dto";
import { type BackupSchedule, BackupSchedulesService } from "./schedules.service";

function toDto(row: BackupSchedule): BackupScheduleDto {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    target: row.target,
    cron: row.cron,
    retention: row.retention,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@ApiTags("backups")
@ApiBearerAuth()
@Controller("backups/schedules")
export class BackupSchedulesController {
  constructor(private readonly schedules: BackupSchedulesService) {}

  @ApiQuery({ name: "deploymentId", required: false, type: String })
  @ApiOkResponse({ type: [BackupScheduleDto] })
  @Get()
  async list(@Query("deploymentId") deploymentId?: string): Promise<BackupScheduleDto[]> {
    return (await this.schedules.list(deploymentId)).map(toDto);
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: CreateBackupScheduleDto })
  @ApiOkResponse({ type: BackupScheduleDto })
  @Post()
  async create(@Body() dto: CreateBackupScheduleDto): Promise<BackupScheduleDto> {
    return toDto(
      await this.schedules.create({
        target: dto.target,
        cron: dto.cron,
        ...(dto.retention !== undefined ? { retention: dto.retention } : {}),
        ...(dto.deploymentId ? { deploymentId: dto.deploymentId } : {}),
      }),
    );
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiBody({ type: UpdateBackupScheduleDto })
  @ApiOkResponse({ type: BackupScheduleDto })
  @Patch(":id")
  async setEnabled(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateBackupScheduleDto,
  ): Promise<BackupScheduleDto> {
    return toDto(await this.schedules.setEnabled(id, dto.enabled));
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete(":id")
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.schedules.remove(id);

    return { ok: true };
  }
}
