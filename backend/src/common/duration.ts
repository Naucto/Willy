import { ConfigError } from "./errors";

// Parse a short duration like "15m", "7d", "30s", "2h" (or a plain number of seconds) into seconds.
export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());

  if (match) {
    const amount = Number(match[1]);

    switch (match[2]) {
      case "s":
        return amount;
      case "m":
        return amount * 60;
      case "h":
        return amount * 3600;
      case "d":
        return amount * 86400;
    }
  }

  const asSeconds = Number(value);

  if (Number.isFinite(asSeconds)) {
    return asSeconds;
  }

  throw new ConfigError(`invalid duration: ${value}`);
}
