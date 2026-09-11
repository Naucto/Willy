import type { MaskedEnvVar } from "../api/types";

// What the Value column shows: the plaintext for a regular var, a dash for a secret.
export function envValueDisplay(row: MaskedEnvVar): string {
  return row.isSecret ? "—" : (row.value ?? "");
}

// Which write to issue when saving the dialog:
// - "set": PUT with a value (create, value edit, or any change that carries a value).
// - "meta": PATCH scope/type only — used when editing a secret without supplying a new value (so the
//   stored secret isn't touched).
export function envSaveMode(args: {
  editing: boolean;
  existingIsSecret: boolean;
  value: string;
}): "set" | "meta" {
  if (args.editing && args.existingIsSecret && args.value === "") {
    return "meta";
  }

  return "set";
}

// Converting a stored secret to a regular var requires a fresh value — Save stays disabled until one
// is entered, so the secret is never auto-revealed.
export function envSaveBlocked(args: {
  editing: boolean;
  existingIsSecret: boolean;
  nextIsSecret: boolean;
  value: string;
}): boolean {
  return args.editing && args.existingIsSecret && !args.nextIsSecret && args.value === "";
}

// The Environment tab's scope is a compose service name, "" meaning the variables shared by every
// service. A name no service answers to any more (renamed, or dropped from the compose file) would
// show an empty list with no way back, so an unknown name falls back to the shared scope.
export function resolveEnvScope(requested: string | null, services: readonly string[]): string {
  if (requested === null || !services.includes(requested)) {
    return "";
  }

  return requested;
}

// How a scope names itself in the selector.
export function envScopeLabel(service: string): string {
  return service === "" ? "Everyone (all services)" : service;
}

// What the add/edit dialog states about where the variable lands. A variable written while a service
// is focused is invisible from the shared scope and absent from `${…}` interpolation in the compose
// file, so the destination is never left implicit.
export function envScopeSubtitle(service: string): string {
  return service === ""
    ? "Applies to every service in this deployment."
    : `Applies to the ${service} service only.`;
}
