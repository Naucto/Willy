import { Inject, Injectable } from "@nestjs/common";
import { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module";

// How long history is kept. Streams are trimmed by entry timestamp on every write, and a matching
// key TTL lets streams for deleted deployments expire on their own once sampling stops.
const RETENTION_MS = 48 * 60 * 60 * 1000;
const RETENTION_SEC = Math.ceil(RETENTION_MS / 1000) + 3600;

export interface Sample<T> {
  ts: number;
  data: T;
}

export function hostKey(): string {
  return "metrics:host";
}

export function deploymentKey(deploymentId: string): string {
  return `metrics:dep:${deploymentId}`;
}

// Time-series store over Redis Streams: each metric source is one stream whose entry IDs are the
// sample timestamps (Redis' native `*` ms-ordered IDs), so time-window reads are a plain XRANGE.
@Injectable()
export class MetricsStoreService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async record(key: string, payload: object): Promise<void> {
    const now = Date.now();

    await this.redis
      .multi()
      .xadd(key, "*", "d", JSON.stringify(payload))
      .xtrim(key, "MINID", "~", now - RETENTION_MS)
      .expire(key, RETENTION_SEC)
      .exec();
  }

  async range<T>(key: string, sinceMs: number): Promise<Sample<T>[]> {
    const entries = await this.redis.xrange(key, `${Math.floor(sinceMs)}-0`, "+");

    return entries.map(([id, fields]) => ({
      ts: Number(id.split("-")[0]),
      data: JSON.parse(fieldValue(fields, "d")) as T,
    }));
  }
}

// XRANGE returns each entry's fields as a flat [name, value, …] array; pull the value for `name`.
function fieldValue(fields: string[], name: string): string {
  const index = fields.indexOf(name);

  if (index < 0 || index + 1 >= fields.length) {
    throw new Error(`metrics entry missing field "${name}"`);
  }

  return fields[index + 1] as string;
}
