import { MenuItem, TextField } from "@mui/material";
import type { Container } from "../api/types";
import { RunningChip, SelectOption } from "./SelectOption";

// Picks which of a deployment's containers the container-scoped tabs (runtime logs, console,
// resources) act on. The selection lives in the URL (?container=) so focus persists across tabs.
// The open menu shows an enriched row per container (title + running/stopped + image); the closed
// control shows a compact single-line label via renderValue.
export function ContainerSelector({
  containers,
  value,
  onChange,
}: {
  containers: Container[];
  value: string;
  onChange: (id: string) => void;
}) {
  const labelFor = (id: string): string => {
    const container = containers.find((candidate) => candidate.id === id);

    if (!container) {
      return "";
    }

    return container.running ? container.name : `${container.name} (stopped)`;
  };

  return (
    <TextField
      select
      size="small"
      label="Container"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 220 }}
      slotProps={{ select: { renderValue: (v) => labelFor(v as string) } }}
    >
      {containers.map((container) => (
        <MenuItem key={container.id} value={container.id}>
          <SelectOption
            title={container.name}
            status={<RunningChip running={container.running} />}
            caption={container.image}
          />
        </MenuItem>
      ))}
    </TextField>
  );
}
