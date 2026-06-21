import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { type Database, DB } from "../db/db.module";
import { DockerSystemService } from "../docker/docker-system.service";

export interface ReadinessReport {
  status: "ok";
  database: boolean;
  docker: boolean;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly dockerSystem: DockerSystemService,
  ) {}

  async readiness(): Promise<ReadinessReport> {
    const [database, docker] = await Promise.all([this.checkDatabase(), this.dockerSystem.ping()]);

    if (!database || !docker) {
      throw new ServiceUnavailableException({ status: "degraded", database, docker });
    }

    return { status: "ok", database, docker };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);

      return true;
    } catch {
      return false;
    }
  }
}
