import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { DeploymentStatsDto, SystemStatsDto } from "./dto/stats.dto";
import { StatsService } from "./stats.service";

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

  @Roles("ADMIN")
  @ApiOkResponse({ type: SystemStatsDto })
  @Get("admin/stats")
  systemStats(): Promise<SystemStatsDto> {
    return this.stats.systemStats();
  }
}
