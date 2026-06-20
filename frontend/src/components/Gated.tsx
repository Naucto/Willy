import { Tooltip } from "@mui/material";
import { cloneElement, type ReactElement } from "react";

// Wraps a single interactive control. When `can` is false, the child is force-disabled and wrapped in
// a tooltip explaining why (the <span> is needed for tooltips on disabled MUI controls). When `can`
// is true the child is returned untouched, so its own pending/disabled logic still applies.
export function Gated({
  can,
  reason,
  children,
}: {
  can: boolean;
  reason: string;
  children: ReactElement<{ disabled?: boolean }>;
}) {
  if (can) {
    return children;
  }

  return (
    <Tooltip title={reason}>
      <span>{cloneElement(children, { disabled: true })}</span>
    </Tooltip>
  );
}
