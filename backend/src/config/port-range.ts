import { ConfigError } from "../common/errors";

// An inclusive host-port range [start, end]. Used both for the provisioned capacity
// (WILLY_PORT_BIND_RANGE) and the panel's active allocatable sub-range.
export interface PortRange {
  start: number;
  end: number;
}

// Ports at or below 1023 are privileged/reserved; the binding feature only ever hands out
// ephemeral-style high ports, so reject anything lower regardless of source.
const MIN_BINDABLE_PORT = 1024;
const MAX_PORT = 65535;

// Parses a "START-END" capacity string. Returns null for an absent/empty value (feature
// unprovisioned); throws ConfigError on a malformed or out-of-bounds range.
export function parsePortRange(value: string | undefined | null): PortRange | null {
  if (!value || value.trim() === "") {
    return null;
  }

  const match = /^(\d+)-(\d+)$/.exec(value.trim());

  if (!match) {
    throw new ConfigError(`Invalid port range "${value}": expected START-END, e.g. 20000-20099`);
  }

  const start = Number.parseInt(match[1] as string, 10);
  const end = Number.parseInt(match[2] as string, 10);

  if (start > end) {
    throw new ConfigError(`Invalid port range "${value}": start must be <= end`);
  }

  if (start < MIN_BINDABLE_PORT || end > MAX_PORT) {
    throw new ConfigError(
      `Invalid port range "${value}": ports must be within ${MIN_BINDABLE_PORT}-${MAX_PORT}`,
    );
  }

  return { start, end };
}

// True when [inner.start, inner.end] is fully contained in [outer.start, outer.end].
export function rangeContains(outer: PortRange, inner: PortRange): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}
