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

// "ADMIN" → "Admin", "USER" → "User" — present roles in prose rather than SCREAMING_CASE.
export function humanizeRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";

  return `${Math.round(value * 10) / 10}%`;
}

export function formatRelativeTime(unixSeconds: number): string {
  const seconds = Math.floor(Date.now() / 1000) - unixSeconds;

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

  return `${Math.floor(seconds / 86400)}d ago`;
}
