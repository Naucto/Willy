import {
  Box,
  CircularProgress,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import type { StatsWindow } from "../api/types";
import { buildGapRows, windowToMs } from "./chartData";

// Distinct hues for stacked breakdowns (e.g. disk by category); single-series charts use the theme
// primary by passing an explicit color per series.
export const CHART_COLORS = ["#4f9cf9", "#56d364", "#e3b341", "#f778ba", "#a371f7"];

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const WINDOW_LABELS: { value: StatsWindow; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
];

export function WindowSelector({
  value,
  onChange,
}: {
  value: StatsWindow;
  onChange: (window: StatsWindow) => void;
}) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_event, next) => next && onChange(next as StatsWindow)}
    >
      {WINDOW_LABELS.map((option) => (
        <ToggleButton key={option.value} value={option.value} sx={{ px: 1.5, py: 0.25 }}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export interface MetricSeries<T> {
  label: string;
  color: string;
  area?: boolean;
  value: (sample: T) => number | null;
}

// A titled time-series line chart. `samples` carry their own `ts` (epoch ms); each series reads its
// value via an accessor so the chart can build one gap-aware timeline shared across series. The
// x-axis is pinned to the full selected `window` so missing data shows as proportional empty space.
// `format` renders both the y-axis ticks and the tooltip values.
export function MetricChart<T extends { ts: number }>({
  title,
  samples,
  series,
  window,
  format,
  loading = false,
  height = 300,
  yMax,
}: {
  title: string;
  samples: T[];
  series: MetricSeries<T>[];
  window: StatsWindow;
  format: (value: number) => string;
  loading?: boolean;
  height?: number;
  // Pin the y-axis ceiling (e.g. total/limit memory) so the area reads against full capacity.
  yMax?: number | undefined;
}) {
  const { times, rows } = buildGapRows(samples);

  // Pin the domain to the whole window (now − windowMs … now) rather than letting the time scale
  // shrink-wrap the data, so a sparsely-populated window leaves empty space at the edges.
  const windowMs = windowToMs(window);
  const max = Date.now();
  const min = max - windowMs;
  const withDate = windowMs > TWELVE_HOURS_MS;

  const formatTick = (value: Date): string =>
    withDate
      ? value.toLocaleString([], {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="overline" sx={{ color: "text.secondary" }}>
        {title}
      </Typography>

      {/* Spinner only on the first load; once we have any data (or know there's none) the chart
          renders, so an empty window shows the pinned time axis rather than a confusing message. */}
      {loading && samples.length === 0 ? (
        <Box sx={{ height, display: "grid", placeItems: "center" }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <LineChart
          height={height}
          xAxis={[
            {
              data: times.map((ts) => new Date(ts)),
              scaleType: "time",
              min,
              max,
              tickNumber: 6,
              // v9 reserves tick-label space via the axis `height`, not the chart margin; the 25px
              // default clips the angled date/time labels, so give them room explicitly.
              height: withDate ? 72 : 48,
              tickLabelStyle: { angle: -40, textAnchor: "end", fontSize: 11 },
              valueFormatter: (value: Date) => formatTick(value),
            },
          ]}
          yAxis={[{ min: 0, max: yMax, valueFormatter: (value: number) => format(value) }]}
          series={series.map((line) => ({
            data: rows.map((row) => (row ? line.value(row) : null)),
            label: line.label,
            color: line.color,
            area: line.area ?? false,
            showMark: false,
            curve: "monotoneX",
            valueFormatter: (value: number | null) => (value === null ? "—" : format(value)),
          }))}
          hideLegend={series.length < 2}
          margin={{ left: 8, right: 16, top: 16 }}
        />
      )}
    </Paper>
  );
}
