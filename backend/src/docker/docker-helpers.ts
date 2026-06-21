import type { HealthcheckSpec } from "../deployments/resource-limits";
import type { DeclaredHealthcheck, DockerHealthConfig } from "./docker.types";

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Docker reports exposed ports as a set keyed "<port>/<proto>" (e.g. "80/tcp"). We surface the TCP
// ports as a deduped, ascending list to drive the domain port picker; UDP isn't web-routable.
export function parseExposedPorts(exposed: Record<string, unknown> | undefined): number[] {
  const ports = Object.keys(exposed ?? {})
    .filter((spec) => spec.endsWith("/tcp"))
    .map((spec) => Number.parseInt(spec, 10))
    .filter((port) => Number.isInteger(port) && port > 0);

  return Array.from(new Set(ports)).sort((a, b) => a - b);
}

// Docker reports healthcheck durations in nanoseconds; surface them as the duration strings users
// recognise (e.g. 30000000000 → "30s"). Null for unset/zero (Docker's "inherit the default").
export function nsToDuration(ns: number | undefined): string | null {
  if (!ns || ns <= 0) {
    return null;
  }

  return `${Math.round(ns / 1e9)}s`;
}

// Parses a Docker duration string ("30s", "1m30s", "500ms") into nanoseconds for the Engine API.
// Returns undefined for blank/unparseable input so Docker falls back to its own default.
export function durationToNs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const matches = value.trim().matchAll(/(\d+)(ms|s|m|h)/g);
  const unit: Record<string, number> = { ms: 1e6, s: 1e9, m: 60e9, h: 3600e9 };
  let total = 0;

  for (const [, amount, suffix] of matches) {
    total += Number(amount) * (unit[suffix ?? "s"] ?? 0);
  }

  return total > 0 ? total : undefined;
}

export function parseDeclaredHealthcheck(
  config: DockerHealthConfig | undefined,
): DeclaredHealthcheck | undefined {
  const test = config?.Test;

  // No healthcheck, or one explicitly disabled (Test: ["NONE"]).
  if (!test || test.length === 0 || test[0] === "NONE") {
    return undefined;
  }

  return {
    test,
    interval: nsToDuration(config?.Interval),
    timeout: nsToDuration(config?.Timeout),
    retries: config?.Retries ?? null,
    startPeriod: nsToDuration(config?.StartPeriod),
  };
}

// Builds the Docker create-config Healthcheck block from a user's custom healthcheck (the test is a
// shell string, wrapped CMD-SHELL). Returns undefined when there's nothing to inject.
export function buildHealthcheckConfig(
  healthcheck: HealthcheckSpec | null | undefined,
): DockerHealthConfig | undefined {
  if (!healthcheck?.test.trim()) {
    return undefined;
  }

  const config: DockerHealthConfig = { Test: ["CMD-SHELL", healthcheck.test] };
  const interval = durationToNs(healthcheck.interval);
  const timeout = durationToNs(healthcheck.timeout);
  const startPeriod = durationToNs(healthcheck.startPeriod);

  if (interval !== undefined) {
    config.Interval = interval;
  }

  if (timeout !== undefined) {
    config.Timeout = timeout;
  }

  if (healthcheck.retries) {
    config.Retries = healthcheck.retries;
  }

  if (startPeriod !== undefined) {
    config.StartPeriod = startPeriod;
  }

  return config;
}

// De-multiplexes a non-TTY Docker log buffer (8-byte frame headers) into plain text.
export function demuxLogBuffer(raw: Buffer): string {
  let text = "";
  let offset = 0;

  while (offset + 8 <= raw.length) {
    const size = raw.readUInt32BE(offset + 4);
    const start = offset + 8;
    text += raw.subarray(start, start + size).toString("utf8");
    offset = start + size;
  }

  return text || raw.toString("utf8");
}
