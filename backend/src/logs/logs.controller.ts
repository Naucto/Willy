import type { Readable } from "node:stream";
import { Controller, NotFoundException, Param, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { BuildLogStore } from "../build/build-log.store";
import { ReleasesService } from "../build/releases.service";
import { DeploymentsService } from "../deployments/deployments.service";
import { DockerService } from "../docker/docker.service";

interface LogEvent {
  data: string;
}

@Controller()
export class LogsController {
  constructor(
    private readonly buildLog: BuildLogStore,
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly docker: DockerService,
  ) {}

  // Live build log for a release: replays buffered lines then streams new ones.
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

  // Live runtime logs of a deployment's active container.
  @Sse("deployments/:id/logs")
  runtimeLogs(@Param("id") id: string): Observable<LogEvent> {
    return new Observable<LogEvent>((subscriber) => {
      let stream: Readable | undefined;
      let cancelled = false;

      void (async () => {
        const deployment = await this.deployments.findById(id);
        const release = deployment?.activeReleaseId
          ? await this.releases.findById(deployment.activeReleaseId)
          : undefined;

        if (!release?.containerId) {
          subscriber.error(new NotFoundException("no running container"));

          return;
        }

        stream = await this.docker.getLogStream(release.containerId, 200);

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
