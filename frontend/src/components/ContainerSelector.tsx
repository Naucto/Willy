import { MenuItem, TextField } from "@mui/material";
import type { Container } from "../api/types";
import { RunningChip, SelectOption } from "./SelectOption";

// A one-shot (migration, seed) is done, not down, once it exited cleanly.
const isCompleted = (container: Container): boolean =>
  container.oneShot && container.state === "exited" && container.exitCode === 0;

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

    if (container.running) {
      return titleFor(container);
    }

    return `${titleFor(container)} (${isCompleted(container) ? "completed" : "stopped"})`;
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
            status={<RunningChip running={container.running} completed={isCompleted(container)} />}
            caption={container.image}
          />
        </MenuItem>
      ))}
    </TextField>
  );
}
