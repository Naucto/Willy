import { Box, Stack } from "@mui/material";
import { useState } from "react";
import { useDeploymentStatsHistory } from "../api/hooks";
import type { Deployment, DeploymentStatsSample, StatsWindow } from "../api/types";
import { formatBytes, formatBytesPerSec, formatPercent } from "../format";
import { CHART_COLORS, MetricChart, WindowSelector } from "./MetricChart";

// Per-deployment resource graphs over a selectable window (aggregated across the deployment's
// containers, like the live utilization cards).
export function MonitoringTab({ deployment }: { deployment: Deployment }) {
  const [window, setWindow] = useState<StatsWindow>("1h");
  const { data, isPending } = useDeploymentStatsHistory(deployment.id, window);
  const samples = data?.samples ?? [];

  // When a memory limit is configured, pin the Memory chart to it so "Used" reads against the cap.
  const memLimit = samples.reduce<number | undefined>(
    (limit, sample) => sample.memLimitBytes ?? limit,
    undefined,
  );

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
        yMax={memLimit}
        series={[
          {
            label: "Used",
            value: (s) => s.memUsageBytes,
            color: CHART_COLORS[1] as string,
            area: true,
          },
        ]}
      />

      <MetricChart<DeploymentStatsSample>
        title="Network I/O"
        samples={samples}
        window={window}
        loading={isPending}
        format={formatBytesPerSec}
        series={[
          {
            label: "RX",
            value: (s) => s.netRxBytesPerSec,
            color: CHART_COLORS[1] as string,
            area: true,
          },
          { label: "TX", value: (s) => s.netTxBytesPerSec, color: CHART_COLORS[3] as string },
        ]}
      />

      <MetricChart<DeploymentStatsSample>
        title="Disk I/O"
        samples={samples}
        window={window}
        loading={isPending}
        format={formatBytesPerSec}
        series={[
          {
            label: "Read",
            value: (s) => s.blkReadBytesPerSec,
            color: CHART_COLORS[1] as string,
            area: true,
          },
          {
            label: "Write",
            value: (s) => s.blkWriteBytesPerSec,
            color: CHART_COLORS[3] as string,
          },
        ]}
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
