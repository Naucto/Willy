import { Box, Stack } from "@mui/material";
import { useState } from "react";
import { useDeploymentStatsHistory } from "../api/hooks";
import type { Deployment, DeploymentStatsSample, StatsWindow } from "../api/types";
import { formatBytes, formatPercent } from "../format";
import { CHART_COLORS, MetricChart, type MetricSeries, WindowSelector } from "./MetricChart";

// Per-deployment resource graphs over a selectable window (aggregated across the deployment's
// containers, like the live utilization cards).
export function MonitoringTab({ deployment }: { deployment: Deployment }) {
  const [window, setWindow] = useState<StatsWindow>("1h");
  const { data, isPending } = useDeploymentStatsHistory(deployment.id, window);
  const samples = data?.samples ?? [];

  const memorySeries: MetricSeries<DeploymentStatsSample>[] = [
    { label: "Used", value: (s) => s.memUsageBytes, color: CHART_COLORS[1] as string, area: true },
  ];

  if (samples.some((sample) => sample.memLimitBytes !== null)) {
    memorySeries.push({
      label: "Limit",
      value: (s) => s.memLimitBytes,
      color: CHART_COLORS[3] as string,
    });
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <WindowSelector value={window} onChange={setWindow} />
      </Box>

      <MetricChart<DeploymentStatsSample>
        title="CPU"
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

      <MetricChart<DeploymentStatsSample>
        title="Memory"
        samples={samples}
        window={window}
        loading={isPending}
        format={formatBytes}
        series={memorySeries}
      />

      <MetricChart<DeploymentStatsSample>
        title="Storage"
        samples={samples}
        window={window}
        loading={isPending}
        format={formatBytes}
        series={[
          {
            label: "Storage",
            value: (s) => s.storageBytes,
            color: CHART_COLORS[2] as string,
            area: true,
          },
        ]}
      />
    </Stack>
  );
}
