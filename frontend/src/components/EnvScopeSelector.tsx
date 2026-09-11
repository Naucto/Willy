import { MenuItem, TextField } from "@mui/material";
import { envScopeLabel } from "./envVarEditing";
import { SelectOption } from "./SelectOption";

export interface EnvScopeOption {
  service: string;
  // No container answers to this service any more (renamed, dropped from the compose file, or the
  // stack is down): its variables are stored but reach nothing.
  orphan: boolean;
}

// Picks which scope the Environment tab reads and writes: the variables shared by every service, or
// one compose service's own. The selection lives in the URL (?scope=) as a service name — not as a
// container id, which the container-scoped tabs use and which changes on every deploy.
export function EnvScopeSelector({
  services,
  value,
  onChange,
}: {
  services: EnvScopeOption[];
  value: string;
  onChange: (service: string) => void;
}) {
  return (
    <TextField
      select
      size="small"
      label="Scope"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 220 }}
      slotProps={{ select: { renderValue: (v) => envScopeLabel(v as string) } }}
    >
      <MenuItem value="">
        <SelectOption title="Everyone" caption="Shared across all services" />
      </MenuItem>
      {services.map((option) => (
        <MenuItem key={option.service} value={option.service}>
          <SelectOption
            title={option.service}
            caption={option.orphan ? "No container — nothing receives these" : "This service only"}
          />
        </MenuItem>
      ))}
    </TextField>
  );
}
