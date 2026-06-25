import { type ValidationOptions, registerDecorator } from "class-validator";
import { WillyError } from "../common/errors";

// Linux capabilities that materially widen the container-escape / privilege-escalation surface.
// Docker's *default* capability set already excludes these, so normal apps never need them — the only
// way one ends up granted is an explicit `capAdd`, which we reject at the API boundary. NET_ADMIN is
// included on purpose: a container on the shared `willy_edge` network could otherwise reshape routing/
// firewall rules and reach sibling tenants. Keeping this an allow-by-default / deny-the-dangerous list
// (rather than `cap-drop ALL`) avoids breaking ordinary images that rely on the default set
// (CHOWN/SETUID/SETGID/NET_BIND_SERVICE, etc.).
export const DANGEROUS_CAPABILITIES: ReadonlySet<string> = new Set([
  "ALL",
  "SYS_ADMIN",
  "SYS_MODULE",
  "SYS_PTRACE",
  "SYS_BOOT",
  "SYS_RAWIO",
  "SYS_TIME",
  "DAC_READ_SEARCH",
  "NET_ADMIN",
  "MAC_ADMIN",
  "MAC_OVERRIDE",
  "BPF",
  "PERFMON",
]);

export class UnsafeCapabilityError extends WillyError {}

// Accept the forms operators actually type — "cap_sys_admin", "CAP_SYS_ADMIN", "sys_admin" — and fold
// them to the bare upper-case name used by the denylist and the Docker API.
export function normalizeCapability(cap: string): string {
  return cap.trim().toUpperCase().replace(/^CAP_/, "");
}

// Returns the denied capabilities in `caps` (empty array = safe).
export function findUnsafeCapabilities(caps: readonly string[] | null | undefined): string[] {
  if (!caps) {
    return [];
  }

  return caps.filter((cap) => DANGEROUS_CAPABILITIES.has(normalizeCapability(cap)));
}

export function assertSafeCapabilities(caps: readonly string[] | null | undefined): void {
  const unsafe = findUnsafeCapabilities(caps);

  if (unsafe.length > 0) {
    throw new UnsafeCapabilityError(
      `disallowed Linux capabilit${unsafe.length > 1 ? "ies" : "y"}: ${unsafe.join(", ")}`,
    );
  }
}

// class-validator constraint for the `capAdd` field across the deployment DTOs, so a dangerous request
// is rejected as a 400 before it ever reaches the orchestrator. Type errors are left to @IsArray.
export function AreCapabilitiesSafe(options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: "areCapabilitiesSafe",
      target: object.constructor,
      propertyName,
      ...(options ? { options } : {}),
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) {
            return true;
          }

          return findUnsafeCapabilities(value as string[]).length === 0;
        },
        defaultMessage(): string {
          return `capAdd contains disallowed capabilities (${[...DANGEROUS_CAPABILITIES].join(", ")})`;
        },
      },
    });
  };
}
