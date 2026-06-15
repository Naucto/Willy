import type { Readable } from "node:stream";
import { Controller, NotFoundException, Param, Query, Sse } from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { Observable } from "rxjs";
import { BuildLogStore } from "../build/build-log.store";
import { ReleasesService } from "../build/releases.service";
import { ContainersService } from "../containers/containers.service";
import { DeploymentsService } from "../deployments/deployments.service";
import { DockerService } from "../docker/docker.service";

interface LogEvent {
  data: string;
}

// SSE streams are consumed by a fetch-based reader on the client (so the bearer
// token can be sent), not the generated OpenAPI client — hence excluded from the spec.
@Controller()
export class LogsController {
  constructor(
    private readonly buildLog: BuildLogStore,
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly docker: DockerService,
    private readonly containers: ContainersService,
  ) {}

  // Live build log for a release: replays buffered lines then streams new ones.
  @ApiExcludeEndpoint()
  @Sse("releases/:id/logs")
  buildLogs(@Param("id") id: string): Observable<LogEvent> {
    return new Observable<LogEvent>((subscriber) => {
      const unsubscribe = this.buildLog.subscribe(
        id,
        (line) => subscriber.next({ data: line }),
        () => subscriber.complete(),
      );

      return () => unsubscribe();
    });
  }

  // Live runtime logs of a deployment's container. With ?container=<id|name> streams that specific
  // container's logs (validated to belong to the deployment); otherwise the active release's.
  @ApiExcludeEndpoint()
  @Sse("deployments/:id/logs")
  runtimeLogs(
    @Param("id") id: string,
    @Query("container") container?: string,
  ): Observable<LogEvent> {
    return new Observable<LogEvent>((subscriber) => {
      let stream: Readable | undefined;
      let cancelled = false;

      void (async () => {
        const deployment = await this.deployments.findById(id);

        if (!deployment) {
          subscriber.error(new NotFoundException("deployment not found"));

          return;
        }

        const containerId = container
          ? await this.containers.resolveContainerId(deployment, container)
          : ((deployment.activeReleaseId
              ? await this.releases.findById(deployment.activeReleaseId)
              : undefined
            )?.containerId ?? null);

        if (!containerId) {
          subscriber.error(new NotFoundException("no running container"));

          return;
        }

        stream = await this.docker.getLogStream(containerId, 200);

        if (cancelled) {
          stream.destroy();

          return;
        }

        stream.on("data", (chunk: Buffer) => {
          for (const line of chunk.toString("utf8").split("\n")) {
            if (line.length > 0) {
              subscriber.next({ data: line });
            }
          }
        });
        stream.on("end", () => subscriber.complete());
        stream.on("error", (error) => subscriber.error(error));
      })().catch((error: unknown) => {
        subscriber.error(error instanceof Error ? error : new Error(String(error)));
      });

      return () => {
        cancelled = true;
        stream?.destroy();
      };
    });
  }
}
