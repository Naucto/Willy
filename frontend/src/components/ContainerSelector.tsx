import { MenuItem, TextField } from "@mui/material";
import type { Container } from "../api/types";
import { RunningChip, SelectOption } from "./SelectOption";

// Sentinel value for the Environment tab's "Everyone" (shared, all-services) scope — not a real
// container id.
export const ALL_CONTAINERS = "__all__";

// Picks which of a deployment's containers the container-scoped tabs (runtime logs, console,
// resources) act on. The selection lives in the URL (?container=) so focus persists across tabs.
// With allowAll, prepends an "Everyone" entry (used by the Environment tab for shared vars). The
// open menu shows an enriched row per container (title + running/stopped + image); the closed
// control shows a compact single-line label via renderValue.
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
  const titleFor = (container: Container): string =>
    allowAll ? (container.service ?? container.name) : container.name;

  const labelFor = (id: string): string => {
    if (id === ALL_CONTAINERS) {
      return "Everyone (all services)";
    }

    const container = containers.find((candidate) => candidate.id === id);

    if (!container) {
      return "";
    }

    return container.running ? titleFor(container) : `${titleFor(container)} (stopped)`;
  };

  return (
    <TextField
      select
      size="small"
      label={allowAll ? "Scope" : "Container"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 220 }}
      slotProps={{ select: { renderValue: (v) => labelFor(v as string) } }}
    >
      {allowAll && (
        <MenuItem value={ALL_CONTAINERS}>
          <SelectOption title="Everyone" caption="Shared across all services" />
        </MenuItem>
      )}
      {containers.map((container) => (
        <MenuItem key={container.id} value={container.id}>
          <SelectOption
            title={titleFor(container)}
            status={<RunningChip running={container.running} />}
            caption={container.image}
          />
        </MenuItem>
      ))}
    </TextField>
  );
}
