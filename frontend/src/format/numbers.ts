export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

// I/O throughput. Unlike formatBytes, a flat 0 is a meaningful reading (idle), so it renders as
// "0 B/s" rather than the empty-value dash.
export function formatBytesPerSec(bytesPerSec: number | null | undefined): string {
  if (bytesPerSec === null || bytesPerSec === undefined) return "—";

  if (bytesPerSec === 0) return "0 B/s";

  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";

  return `${Math.round(value * 10) / 10}%`;
}
