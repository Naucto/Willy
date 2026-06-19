import { Box, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { useSystemStatsHistory } from "../api/hooks";
import type { HostStatsSample, StatsWindow } from "../api/types";
import { CHART_COLORS, MetricChart, WindowSelector } from "../components/MetricChart";
import { formatBytes, formatPercent } from "../format";

// Host-wide resource graphs over a selectable time window. The compact KPI cards on the Deployments
// page link here.
export function MonitoringPage() {
  const [window, setWindow] = useState<StatsWindow>("1h");
  const { data, isPending } = useSystemStatsHistory(window);
  const samples = data?.samples ?? [];

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="h4" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Monitoring
        </Typography>
        <WindowSelector value={window} onChange={setWindow} />
      </Box>

      <MetricChart<HostStatsSample>
        title="Host CPU"
        samples={samples}
        window={window}
        loading={isPending}
        format={formatPercent}
        series={[
          {
            label: "CPU",
            value: (s) => s.cpuPercent,
            color: CHART_COLORS[0] as string,
            area: true,
          },
        ]}
      />

      <MetricChart<HostStatsSample>
        title="Memory"
        samples={samples}
        window={window}
        loading={isPending}
        format={formatBytes}
        series={[
          {
            label: "Used",
            value: (s) => s.memUsageBytes,
            color: CHART_COLORS[1] as string,
            area: true,
          },
          { label: "Total", value: (s) => s.memTotalBytes, color: CHART_COLORS[4] as string },
        ]}
      />

      <MetricChart<HostStatsSample>
        title="Disk usage"
        samples={samples}
        window={window}
        loading={isPending}
        format={formatBytes}
        series={[
          { label: "Images", value: (s) => s.disk.imagesBytes, color: CHART_COLORS[0] as string },
          { label: "Volumes", value: (s) => s.disk.volumesBytes, color: CHART_COLORS[1] as string },
          {
            label: "Containers",
            value: (s) => s.disk.containersBytes,
            color: CHART_COLORS[2] as string,
          },
          {
            label: "Build cache",
            value: (s) => s.disk.buildCacheBytes,
            color: CHART_COLORS[3] as string,
          },
        ]}
      />
    </Stack>
  );
}
