import { MenuItem, TextField } from "@mui/material";
import type { Container } from "../api/types";

// Sentinel value for the Environment tab's "Everyone" (shared, all-services) scope — not a real
// container id.
export const ALL_CONTAINERS = "__all__";

// Picks which of a deployment's containers the container-scoped tabs (runtime logs, console,
// volumes, networking, resources) act on. The selection lives in the URL (?container=) so focus
// persists across tabs. With allowAll, prepends an "Everyone" entry (used by the Environment tab
// for shared vars).
export function ContainerSelector({
  containers,
  value,
  onChange,
  allowAll,
}: {
  containers: Container[];
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
}) {
  return (
    <TextField
      select
      size="small"
      label={allowAll ? "Scope" : "Container"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 200 }}
    >
      {allowAll && <MenuItem value={ALL_CONTAINERS}>Everyone (all services)</MenuItem>}
      {containers.map((container) => (
        <MenuItem key={container.id} value={container.id}>
          {allowAll ? (container.service ?? container.name) : container.name}
          {!container.running ? " (stopped)" : ""}
        </MenuItem>
      ))}
    </TextField>
  );
}
