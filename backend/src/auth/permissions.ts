import type { Role } from "../users/users.service";

// UI capabilities derived from a role. The @Roles guards remain the real security boundary; these
// are the single source of truth the frontend uses to show/disable controls (no role logic on the
// client). @Roles are flat — every guarded route needs ADMIN or ADMIN+OPERATOR — so two tiers cover
// it: "operate" = any mutation, "admin" = admin-only pages/actions + delete deployment.
export const CAPABILITIES = ["operate", "admin"] as const;

export type Capability = (typeof CAPABILITIES)[number];

export function capabilitiesForRole(role: Role): Capability[] {
  switch (role) {
    case "ADMIN":
      return ["operate", "admin"];
    case "OPERATOR":
      return ["operate"];
    default:
      return [];
  }
}
