import { Box, Chip, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

// Compact running/stopped badge for the enriched selectors' status slot.
export function RunningChip({ running }: { running: boolean }) {
  return (
    <Chip
      label={running ? "running" : "stopped"}
      size="small"
      color={running ? "success" : "default"}
      variant="outlined"
      sx={{ height: 18, "& .MuiChip-label": { px: 0.75, fontSize: 11 } }}
    />
  );
}

// A two-line dropdown option: a bold title with an optional status badge on the right, and a muted
// caption underneath (image name, timestamp, …). Shared by the container, release, and service
// selectors so their enriched menus look the same. Pair with a `renderValue` that shows a compact
// single-line label for the closed control.
export function SelectOption({
  title,
  status,
  caption,
}: {
  title: string;
  status?: ReactNode;
  caption?: string | undefined;
}) {
  return (
    <Stack spacing={0.25} sx={{ minWidth: 0, py: 0.25 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 500, minWidth: 0 }}>
          {title}
        </Typography>
        {status}
      </Box>
      {caption && (
        <Typography variant="caption" color="text.secondary" noWrap>
          {caption}
        </Typography>
      )}
    </Stack>
  );
}
