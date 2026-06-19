import { Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import {
  DeploymentStatsDto,
  DeploymentStatsHistoryDto,
  HostStatsHistoryDto,
  SystemStatsDto,
} from "./dto/stats.dto";
import { StatsService } from "./stats.service";
import { StatsWindow } from "./stats.util";

@ApiTags("stats")
@ApiBearerAuth()
@Controller()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: DeploymentStatsDto })
  @Get("deployments/:id/stats")
  deploymentStats(@Param("id", ParseUUIDPipe) id: string): Promise<DeploymentStatsDto> {
    return this.stats.deploymentStats(id);
  }

  @ApiParam({ name: "id", type: String })
  @ApiQuery({ name: "window", required: false, enum: StatsWindow })
  @ApiOkResponse({ type: DeploymentStatsHistoryDto })
  @Get("deployments/:id/stats/history")
  deploymentHistory(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("window", new ParseEnumPipe(StatsWindow, { optional: true })) window?: StatsWindow,
  ): Promise<DeploymentStatsHistoryDto> {
    return this.stats.deploymentHistory(id, window ?? StatsWindow.OneHour);
  }

  @Roles("ADMIN")
  @ApiOkResponse({ type: SystemStatsDto })
  @Get("admin/stats")
  systemStats(): Promise<SystemStatsDto> {
    return this.stats.systemStats();
  }

  @Roles("ADMIN")
  @ApiQuery({ name: "window", required: false, enum: StatsWindow })
  @ApiOkResponse({ type: HostStatsHistoryDto })
  @Get("admin/stats/history")
  systemHistory(
    @Query("window", new ParseEnumPipe(StatsWindow, { optional: true })) window?: StatsWindow,
  ): Promise<HostStatsHistoryDto> {
    return this.stats.systemHistory(window ?? StatsWindow.OneHour);
  }
}
