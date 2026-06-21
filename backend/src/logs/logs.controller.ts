import {
  BadRequestException,
  Controller,
  NotFoundException,
  Param,
  Query,
  Sse,
} from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { Observable } from "rxjs";
import { BuildLogStore } from "../build/build-log.store";
import { ReleasesService, isTerminalReleaseStatus } from "../build/releases.service";
import { runtimeLogKey } from "../build/runtime-log.collector";
import { ContainersService } from "../containers/containers.service";
import { DeploymentsService } from "../deployments/deployments.service";
import { DockerContainerService } from "../docker/docker-container.service";
import { LogStorageService } from "./log-storage.service";

interface LogEvent {
  data: string;
}

// Final frame sent before completing a build-log stream, so the client can tell a normal end
// (build finished) from a dropped connection and never render it as an error.
export const LOG_STREAM_EOF = "__willy_eof__";

// SSE streams are consumed by a fetch-based reader on the client (so the bearer token can be sent),
// not the generated OpenAPI client — hence excluded from the spec. Both endpoints replay the
// durable history first (survives restarts / stopped containers) then stream live lines.
@Controller()
export class LogsController {
  constructor(
    private readonly buildLog: BuildLogStore,
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly dockerContainers: DockerContainerService,
    private readonly containers: ContainersService,
    private readonly logs: LogStorageService,
  ) {}

  // Build log for a release: replays persisted lines, then streams live ones while the build runs.
  // After a restart the build is over, so a cold (replay-only) stream completes once replayed.
  @ApiExcludeEndpoint()
  @Sse("releases/:id/logs")
  buildLogs(@Param("id") id: string): Observable<LogEvent> {
    return new Observable<LogEvent>((subscriber) => {
      let cancelled = false;
      let detachLine = (): void => {};
      let detachDone = (): void => {};

      void (async () => {
        const attachLive = (): void => {
          detachLine = this.buildLog.onLine(id, (line) => subscriber.next({ data: line }));
          detachDone = this.buildLog.onDone(id, () => {
            subscriber.next({ data: LOG_STREAM_EOF });
            subscriber.complete();
          });
        };

        const history = await this.buildLog.history(id);

        for (const line of history) {
          subscriber.next({ data: line });
        }

        if (cancelled) {
          return;
        }

        if (this.buildLog.isLive(id)) {
          attachLive();

          return;
        }

        // Not live yet. Distinguish "build is over" (terminal release, or persisted history to
        // cold-replay) from "the build just hasn't logged its first line yet" — a console opened in
        // that startup gap must not end instantly, or it shows an empty, already-closed build.
        const release = await this.releases.findById(id);

        if (this.buildLog.isLive(id)) {
          attachLive();

          return;
        }

        if (!release || history.length > 0 || isTerminalReleaseStatus(release.status)) {
          subscriber.next({ data: LOG_STREAM_EOF });
          subscriber.complete();

          return;
        }

        attachLive();
      })().catch((error: unknown) => {
        subscriber.error(error instanceof Error ? error : new Error(String(error)));
      });

      return () => {
        cancelled = true;
        detachLine();
        detachDone();
      };
    });
  }

  // Runtime logs of a deployment's container. With ?container=<id|name> targets that container
  // (validated to belong to the deployment); otherwise the active release's. Replays the durable
  // history (kept across restarts and after the container stops) then streams live lines.
  @ApiExcludeEndpoint()
  @Sse("deployments/:id/logs")
  runtimeLogs(
    @Param("id") id: string,
    @Query("container") container?: string,
  ): Observable<LogEvent> {
    return new Observable<LogEvent>((subscriber) => {
      let cancelled = false;
      let detachLine = (): void => {};

      void (async () => {
        const deployment = await this.deployments.findById(id);

        if (!deployment) {
          subscriber.error(new NotFoundException("deployment not found"));

          return;
        }

        let containerId: string | null;

        if (container) {
          containerId = await this.containers.resolveContainerId(deployment, container);
        } else {
          // Single-container deployments pin the active release's container; compose stores none,
          // so resolve to the sole discovered one (ambiguous when several — prompt for a choice).
          const active = deployment.activeReleaseId
            ? await this.releases.findById(deployment.activeReleaseId)
            : undefined;

          if (active?.containerId) {
            containerId = active.containerId;
          } else {
            const resolved = await this.containers.defaultContainer(deployment);

            if (resolved.ambiguous) {
              subscriber.error(new BadRequestException("multiple containers — select one"));

              return;
            }

            containerId = resolved.id;
          }
        }

        // Resolve the durable key from the live container's service; when nothing is running we
        // still replay history (single-container → the "default" key).
        let key = runtimeLogKey(id, null);
        let live = false;

        if (containerId) {
          const info = await this.dockerContainers.inspectContainer(containerId);
          key = runtimeLogKey(id, info?.service ?? null);
          live = Boolean(info?.running);
        }

        for (const line of await this.logs.history(key)) {
          subscriber.next({ data: line });
        }

        if (cancelled) {
          return;
        }

        if (live) {
          detachLine = this.logs.onLine(key, (line) => subscriber.next({ data: line }));
        } else {
          subscriber.complete();
        }
      })().catch((error: unknown) => {
        subscriber.error(error instanceof Error ? error : new Error(String(error)));
      });

      return () => {
        cancelled = true;
        detachLine();
      };
    });
  }
}
