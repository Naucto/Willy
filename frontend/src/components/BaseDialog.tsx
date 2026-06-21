import {
  type Breakpoint,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from "@mui/material";
import type { ReactNode } from "react";
import { OperateButton } from "./OperateButton";

// The common add/edit dialog shell: title, a spacing Stack of form fields, and a Cancel + confirm
// action row. The confirm button is operator-gated by default (set `gated={false}` for dialogs any
// signed-in user may submit). Keeps bespoke dialogs free to render their own Dialog when they need a
// non-standard layout.
export function BaseDialog({
  open = true,
  title,
  onClose,
  onConfirm,
  confirmLabel = "Save",
  confirmDisabled,
  gated = true,
  maxWidth = "sm",
  contentSpacing = 2,
  children,
}: {
  open?: boolean;
  title: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  gated?: boolean;
  maxWidth?: Breakpoint;
  contentSpacing?: number;
  children: ReactNode;
}) {
  const Confirm = gated ? OperateButton : Button;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={maxWidth}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={contentSpacing} sx={{ mt: 1 }}>
          {children}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Confirm variant="contained" onClick={onConfirm} disabled={confirmDisabled}>
          {confirmLabel}
        </Confirm>
      </DialogActions>
    </Dialog>
  );
}
