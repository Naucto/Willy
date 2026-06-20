import type { ReactNode } from "react";
import { NoAccess } from "../components/NoAccess";
import { useCan } from "./permissions";

// Renders an admin-only page, or a friendly no-access panel when the user lacks the capability
// (e.g. a non-admin reaching the page by typing its URL).
export function AdminRoute({ children }: { children: ReactNode }) {
  return useCan("admin") ? children : <NoAccess reason="Requires Admin role" />;
}
