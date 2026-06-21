import { WillyError } from "../../common/errors";
import type { DockerContainerService } from "../../docker/docker-container.service";
import type { OneShotOptions } from "../../docker/docker.service";
import { INTERNAL_LABEL } from "../../traefik/label-generator.service";
import type { DestinationConfig, DestinationType } from "../destinations.service";

export class OffsiteError extends WillyError {}

// One interface, one implementation per destination type. Each driver runs a throwaway helper
// container (so the toolchain stays out of the willy-server image) that reads the artifact off the
// willy_backups volume and ships it to the destination.
export interface OffsiteDriver {
  readonly type: DestinationType;
  // Verify connectivity + credentials; throw OffsiteError on failure.
  test(config: DestinationConfig): Promise<void>;
  // Upload the artifact named `file` (within willy_backups) and return its offsite URL.
  push(file: string, config: DestinationConfig): Promise<string>;
}

// Runs a helper container to completion and fails loudly on a non-zero exit. The helper joins
// `network` (so destinations resolvable on a Willy network work) and is tagged internal so the
// admin panel hides it.
export async function runHelper(
  dockerContainers: DockerContainerService,
  label: string,
  network: string | undefined,
  options: OneShotOptions,
): Promise<void> {
  const result = await dockerContainers.runToCompletion({
    ...options,
    network,
    labels: { [INTERNAL_LABEL]: "true", ...options.labels },
  });

  if (result.exitCode !== 0) {
    throw new OffsiteError(
      `${label} failed (${result.exitCode}): ${result.logs.trim().slice(0, 300)}`,
    );
  }
}
