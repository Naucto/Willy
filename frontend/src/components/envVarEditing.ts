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
