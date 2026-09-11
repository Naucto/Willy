import { MenuItem, TextField } from "@mui/material";
import { envScopeLabel } from "./envVarEditing";
import { SelectOption } from "./SelectOption";

// Picks which scope the Environment tab reads and writes: the variables shared by every service, or
// one compose service's own. The selection lives in the URL (?scope=) as a service name — not as a
// container id, which the container-scoped tabs use and which changes on every deploy.
export function EnvScopeSelector({
  services,
  value,
  onChange,
}: {
  services: string[];
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
      {services.map((service) => (
        <MenuItem key={service} value={service}>
          <SelectOption title={service} caption="This service only" />
        </MenuItem>
      ))}
    </TextField>
  );
}
