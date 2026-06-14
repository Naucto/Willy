import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { HealthService, ReadinessReport } from "./health.service";

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
