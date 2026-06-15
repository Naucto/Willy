import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { OkResponseDto } from "../common/dto/ok.dto";
import { DeploymentsService } from "../deployments/deployments.service";
import { BuildOrchestrator } from "./build-orchestrator.service";
import { ReleaseDto } from "./dto/release.dto";
import { type Release, ReleasesService } from "./releases.service";

@ApiTags("deployments")
@ApiBearerAuth()
@ApiParam({ name: "id", type: String })
@Controller()
export class DeploymentActionsController {
  constructor(
    private readonly orchestrator: BuildOrchestrator,
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
  ) {}

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
