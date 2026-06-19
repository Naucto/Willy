import { Box, CircularProgress, Paper, Typography } from "@mui/material";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

// Compact KPI card: a label, the current value (+ optional detail), and a mini area sparkline of
// recent history. Optionally links through to its full-chart page.
export function StatCard({
  title,
  value,
  detail,
  icon,
  data,
  color = "#4f9cf9",
  to,
  loading = false,
}: {
  title: string;
  value: string;
  detail?: string | undefined;
  icon?: ReactNode | undefined;
  data: number[];
  color?: string | undefined;
  to?: string | undefined;
  loading?: boolean;
}) {
  const card = (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        ...(to && {
          transition: (theme) => theme.transitions.create("border-color"),
          "&:hover": { borderColor: "primary.main" },
        }),
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
        {icon}
        <Typography variant="overline">{title}</Typography>
      </Box>

      {loading ? (
        <Box sx={{ flexGrow: 1, display: "grid", placeItems: "center", py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, mt: 0.5, fontVariantNumeric: "tabular-nums" }}
          >
            {value}
          </Typography>

          <Typography variant="caption" sx={{ color: "text.secondary", minHeight: 18 }}>
            {detail ?? ""}
          </Typography>

          <Box sx={{ mt: "auto", pt: 1, mx: -0.5 }}>
            {data.length > 1 ? (
              <SparkLineChart
                data={data}
                height={48}
                area
                showHighlight
                curve="monotoneX"
                color={color}
              />
            ) : (
              // Keep the card height stable before any history has accumulated.
              <Box sx={{ height: 48 }} />
            )}
          </Box>
        </>
      )}
    </Paper>
  );

  if (!to) {
    return card;
  }

  return (
    <Box
      component={RouterLink}
      to={to}
      sx={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}
    >
      {card}
    </Box>
  );
}
