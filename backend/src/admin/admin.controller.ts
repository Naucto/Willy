import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseBoolPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { AuditService } from "../audit/audit.service";
import { TasksService } from "../tasks/tasks.service";
import { AdminService } from "./admin.service";
import { AdminContainerDto } from "./dto/admin-container.dto";
import { AdminImageDto } from "./dto/admin-image.dto";
import { AppSettingsDto, UpdateAppSettingsDto } from "./dto/app-settings.dto";
import { PruneResultDto } from "./dto/prune-result.dto";
import { SettingsService } from "./settings.service";

@ApiTags("admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly settings: SettingsService,
    private readonly tasks: TasksService,
    private readonly audit: AuditService,
  ) {}

  @ApiQuery({ name: "all", required: false, type: Boolean })
  @ApiOkResponse({ type: [AdminImageDto] })
  @Get("images")
  getImages(
    @Query("all", new ParseBoolPipe({ optional: true })) all?: boolean,
  ): Promise<AdminImageDto[]> {
    return this.admin.getImages(all ?? false);
  }

  @ApiParam({ name: "id", type: String, description: "Image ID or tag." })
  @ApiNoContentResponse({ description: "Image removed." })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("images/:id")
  deleteImage(@Param("id") id: string): Promise<void> {
    return this.admin.deleteImage(id);
  }

  @ApiOkResponse({ type: PruneResultDto })
  @Post("images/prune")
  pruneImages(@CurrentUser() user: AuthUser, @Ip() ip: string): Promise<PruneResultDto> {
    return this.tasks.track(
      { kind: "PRUNE_IMAGES", title: "Prune dangling images", actorId: user.userId },
      async () => {
        const result = await this.admin.pruneImages();
        await this.audit.record({
          actorId: user.userId,
          action: "PRUNE_IMAGES",
          ip,
          metadata: { ...result },
        });

        return result;
      },
    );
  }

  @ApiQuery({ name: "all", required: false, type: Boolean })
  @ApiOkResponse({ type: [AdminContainerDto] })
  @Get("containers")
  getContainers(
    @Query("all", new ParseBoolPipe({ optional: true })) all?: boolean,
  ): Promise<AdminContainerDto[]> {
    return this.admin.getContainers(all ?? false);
  }

  @ApiOkResponse({ type: PruneResultDto })
  @Post("containers/prune")
  pruneContainers(@CurrentUser() user: AuthUser, @Ip() ip: string): Promise<PruneResultDto> {
    return this.tasks.track(
      { kind: "PRUNE_CONTAINERS", title: "Prune stopped containers", actorId: user.userId },
      async () => {
        const result = await this.admin.pruneContainers();
        await this.audit.record({
          actorId: user.userId,
          action: "PRUNE_CONTAINERS",
          ip,
          metadata: { ...result },
        });

        return result;
      },
    );
  }

  @ApiOkResponse({ type: AppSettingsDto })
  @Get("settings")
  getSettings(): Promise<AppSettingsDto> {
    return this.settings.getAll();
  }

  @ApiBody({ type: UpdateAppSettingsDto })
  @ApiOkResponse({ type: AppSettingsDto })
  @Put("settings")
  async updateSettings(
    @Body() body: UpdateAppSettingsDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<AppSettingsDto> {
    const result = await this.settings.update(body);
    await this.audit.record({
      actorId: user.userId,
      action: "SETTINGS_CHANGE",
      ip,
      metadata: { ...body },
    });

    return result;
  }
}
