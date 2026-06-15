import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { DeploymentsService } from "../deployments/deployments.service";
import { BuildOrchestrator } from "./build-orchestrator.service";
import { type Release, ReleasesService } from "./releases.service";

@Controller()
export class DeploymentActionsController {
  constructor(
    private readonly orchestrator: BuildOrchestrator,
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
  ) {}

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @Post("deployments/:id/deploy")
  deploy(@Param("id") id: string, @CurrentUser() user: AuthUser): Promise<Release> {
    return this.orchestrator.deploy(id, user.userId);
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @Post("deployments/:id/stop")
  async stop(@Param("id") id: string): Promise<{ ok: true }> {
    await this.orchestrator.stop(id);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(202)
  @Post("deployments/:id/start")
  async start(@Param("id") id: string): Promise<{ ok: true }> {
    await this.orchestrator.start(id);

    return { ok: true };
  }

  @Roles("ADMIN")
  @Delete("deployments/:id")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.orchestrator.teardown(id);
    await this.deployments.remove(id);

    return { ok: true };
  }

  @Get("deployments/:id/releases")
  listReleases(@Param("id") id: string): Promise<Release[]> {
    return this.releases.listForDeployment(id);
  }

  @Get("releases/:id")
  async getRelease(@Param("id") id: string): Promise<Release> {
    const release = await this.releases.findById(id);

    if (!release) {
      throw new NotFoundException("release not found");
    }

    return release;
  }
}
