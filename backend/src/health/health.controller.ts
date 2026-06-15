import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { HealthService, ReadinessReport } from "./health.service";

// Health routes live outside the /api prefix (for the container probe), so they
// are not part of the generated API client.
@ApiExcludeController()
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  readiness(): Promise<ReadinessReport> {
    return this.health.readiness();
  }
}
