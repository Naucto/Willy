import { WillyError } from "../common/errors";

// A container or stack never reached a healthy/reachable state within the deploy's health gate.
// Shared between ContainerOps (single-container launch) and the orchestrator (compose stack).
export class HealthCheckError extends WillyError {}

// A one-shot compose service (its own file sets `restart: "no"`) exited non-zero. Fails the gate at
// once: it will not run again, so waiting out the deadline could only end the same way.
export class OneShotFailedError extends HealthCheckError {
  constructor(
    readonly service: string,
    readonly exitCode: number,
  ) {
    super(`one-shot service "${service}" exited with code ${exitCode}`);
  }
}
