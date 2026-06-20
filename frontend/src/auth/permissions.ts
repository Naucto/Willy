import type { AuthUser } from "../api/types";
import { useAuth } from "./AuthContext";

// Capabilities are defined and granted by the backend (see backend/src/auth/permissions.ts); the
// type is derived from the generated API so the frontend never hardcodes role→capability logic.
export type Capability = AuthUser["permissions"][number];

export const ROLE_REASON: Record<Capability, string> = {
  operate: "Requires Operator role",
  admin: "Requires Admin role",
};

// True when the signed-in user was granted `capability` by the backend.
export function useCan(capability: Capability): boolean {
  const { user } = useAuth();

  return user?.permissions.includes(capability) ?? false;
}
