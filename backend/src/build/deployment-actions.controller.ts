import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { OkResponseDto } from "../common/dto/ok.dto";
import { DeploymentsService } from "../deployments/deployments.service";
import { BuildOrchestrator } from "./build-orchestrator.service";
import { type CronRun, CronRunsService } from "./cron-runs.service";
import { CronService } from "./cron.service";
import { CronRunDto } from "./dto/cron-run.dto";
import { ReleaseDto } from "./dto/release.dto";
import { type Release, ReleasesService } from "./releases.service";

function cronRunToDto(row: CronRun): CronRunDto {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    status: row.status,
    exitCode: row.exitCode,
    logs: row.logs,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

@ApiTags("deployments")
@ApiBearerAuth()
@ApiParam({ name: "id", type: String })
@Controller()
export class DeploymentActionsController {
  constructor(
    private readonly orchestrator: BuildOrchestrator,
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly cron: CronService,
    private readonly cronRuns: CronRunsService,
  ) {}

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @ApiOkResponse({ type: OkResponseDto })
  @Post("deployments/:id/run")
  async run(@Param("id") id: string): Promise<{ ok: true }> {
    await this.cron.runNow(id);

    return { ok: true };
  }

  @ApiOkResponse({ type: [CronRunDto] })
  @Get("deployments/:id/cron-runs")
  async cronRunHistory(@Param("id") id: string): Promise<CronRunDto[]> {
    return (await this.cronRuns.listForDeployment(id)).map(cronRunToDto);
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @ApiOkResponse({ type: ReleaseDto })
  @Post("deployments/:id/deploy")
  deploy(@Param("id") id: string, @CurrentUser() user: AuthUser): Promise<Release> {
    return this.orchestrator.deploy(id, user.userId);
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @ApiOkResponse({ type: OkResponseDto })
  @Post("deployments/:id/stop")
  async stop(@Param("id") id: string): Promise<{ ok: true }> {
    await this.orchestrator.stop(id);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @ApiOkResponse({ type: OkResponseDto })
  @Post("deployments/:id/start")
  async start(@Param("id") id: string): Promise<{ ok: true }> {
    await this.orchestrator.start(id);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @ApiOkResponse({ type: OkResponseDto })
  @Post("deployments/:id/restart")
  async restart(@Param("id") id: string): Promise<{ ok: true }> {
    await this.orchestrator.restart(id);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @ApiParam({ name: "releaseId", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Post("deployments/:id/rollback/:releaseId")
  async rollback(
    @Param("id") id: string,
    @Param("releaseId") releaseId: string,
  ): Promise<{ ok: true }> {
    await this.orchestrator.rollback(id, releaseId);

    return { ok: true };
  }

  @Roles("ADMIN")
  @ApiOkResponse({ type: OkResponseDto })
  @Delete("deployments/:id")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.orchestrator.teardown(id);
    await this.deployments.remove(id);

    return { ok: true };
  }

  @ApiOkResponse({ type: [ReleaseDto] })
  @Get("deployments/:id/releases")
  listReleases(@Param("id") id: string): Promise<Release[]> {
    return this.releases.listForDeployment(id);
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiParam({ name: "releaseId", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete("deployments/:id/releases/:releaseId")
  async deleteRelease(
    @Param("id") id: string,
    @Param("releaseId") releaseId: string,
  ): Promise<{ ok: true }> {
    await this.orchestrator.deleteRelease(id, releaseId);

    return { ok: true };
  }

  @ApiOkResponse({ type: ReleaseDto })
  @Get("releases/:id")
  async getRelease(@Param("id") id: string): Promise<Release> {
    const release = await this.releases.findById(id);

    if (!release) {
      throw new NotFoundException("release not found");
    }

    return release;
  }
}
