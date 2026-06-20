import { MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { Role } from "../api/types";

export const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  {
    value: "ADMIN",
    label: "Admin",
    description: "Full access — manage users, all deployments, and panel settings.",
  },
  {
    value: "OPERATOR",
    label: "Operator",
    description: "Deploy and configure resources; cannot manage users.",
  },
  {
    value: "VIEWER",
    label: "Viewer",
    description: "Read-only access — cannot trigger deploys or change configuration.",
  },
];

export function RoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: Role;
  disabled?: boolean;
  onChange: (role: Role) => void;
}) {
  return (
    <TextField
      select
      label="Role"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as Role)}
      slotProps={{
        select: {
          renderValue: (v) => ROLE_OPTIONS.find((o) => o.value === v)?.label ?? (v as string),
        },
      }}
    >
      {ROLE_OPTIONS.map((opt) => (
        <MenuItem key={opt.value} value={opt.value}>
          <Stack spacing={0.25}>
            <Typography variant="body2">{opt.label}</Typography>
            <Typography variant="caption" color="text.secondary">
              {opt.description}
            </Typography>
          </Stack>
        </MenuItem>
      ))}
    </TextField>
  );
}
