import { WillyError } from "../common/errors";

// A container or stack never reached a healthy/reachable state within the deploy's health gate.
// Shared between ContainerOps (single-container launch) and the orchestrator (compose stack).
export class HealthCheckError extends WillyError {}
