// DockerService was split into focused services (image/container/system/log) — see the docker-*.service
// files. This barrel re-exports the shared types and pure helpers so existing type/helper imports from
// "../docker/docker.service" keep resolving; inject the specific Docker* service for behaviour.
export * from "./docker.types";
export { durationToNs, parseExposedPorts } from "./docker-helpers";
