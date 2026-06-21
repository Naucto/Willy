import { MenuItem, TextField } from "@mui/material";

// The volume picker shown in the deployment bar on the Files section — mirrors ContainerSelector's
// look so the bar's selectors stay consistent.
export function VolumeSelector({
  volumes,
  value,
  onChange,
}: {
  volumes: string[];
  value: string;
  onChange: (volume: string) => void;
}) {
  return (
    <TextField
      select
      size="small"
      label="Volume"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 220 }}
    >
      {volumes.map((name) => (
        <MenuItem key={name} value={name}>
          {name}
        </MenuItem>
      ))}
    </TextField>
  );
}
