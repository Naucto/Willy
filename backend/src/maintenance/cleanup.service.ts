import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DeploymentsService } from "../deployments/deployments.service";
import { DockerService } from "../docker/docker.service";

// Keep the newest N images per deployment (matching the orchestrator's per-deploy keep-N); the rest
// are stale rollbacks that disk cleanup reclaims.
const KEEP_IMAGES_PER_DEPLOYMENT = 3;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface CleanupResult {
  spaceReclaimedBytes: number;
  removedImageTags: string[];
}

// Scoped disk cleanup: trims each deployment's image history to keep-N and prunes only dangling
// (untagged) layers. Deliberately never a blanket `image prune -a` — that would delete images still
// referenced by stopped deployments. Runs nightly and on demand.
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly deployments: DeploymentsService,
    private readonly docker: DockerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async scheduled(): Promise<void> {
    const result = await this.run();
    this.logger.log(
      `cleanup: removed ${result.removedImageTags.length} stale image(s), reclaimed ${result.spaceReclaimedBytes} bytes`,
    );
  }

  async run(): Promise<CleanupResult> {
    const removedImageTags: string[] = [];
    const deployments = await this.deployments.findAll();

    for (const deployment of deployments) {
      try {
        const tags = await this.docker.listImageTags(`willy/${deployment.name}`);

        for (const tag of tags.slice(KEEP_IMAGES_PER_DEPLOYMENT)) {
          await this.docker.removeImage(tag);
          removedImageTags.push(tag);
        }
      } catch (error) {
        this.logger.warn(`cleanup for ${deployment.name} failed: ${describeError(error)}`);
      }
    }

    const spaceReclaimedBytes = await this.docker.pruneDanglingImages();

    return { spaceReclaimedBytes, removedImageTags };
  }
}
