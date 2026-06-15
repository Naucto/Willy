import { MenuItem, TextField } from "@mui/material";
import type { Container } from "../api/types";

// Picks which of a deployment's containers the container-scoped tabs (runtime logs, console,
// volumes) act on. The selection lives in the URL (?container=) so focus persists across tabs.
export function ContainerSelector({
  containers,
  value,
  onChange,
}: {
  containers: Container[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <TextField
      select
      size="small"
      label="Container"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 200 }}
    >
      {containers.map((container) => (
        <MenuItem key={container.id} value={container.id}>
          {container.name}
          {!container.running ? " (stopped)" : ""}
        </MenuItem>
      ))}
    </TextField>
  );
}
