import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

// Two-column settings layout used by Resources, Settings, and Webhook panels:
// left column holds the setting name + description, right column holds the control(s).
// Rows are visually separated by their own vertical padding — no dividers at the call site.
export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        // Wider label column on roomy screens; stacks on phones (xs).
        gridTemplateColumns: { xs: "1fr", sm: "260px 1fr", md: "320px 1fr" },
        gap: { xs: 1, sm: 4 },
        py: 2.5,
      }}
    >
      <Box>
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, opacity: 0.75 }}>
          {description}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</Box>
    </Box>
  );
}
