import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

export const REDIS = Symbol("WILLY_REDIS");

// Redis backs the time-series metrics history (see MetricsStoreService). Mirrors DbModule's
// global factory-provider shape; the module itself owns the connection's lifecycle so it's
// closed cleanly on shutdown.
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis =>
        // Keep retrying forever rather than rejecting in-flight commands during a transient
        // outage — the sampler runs unattended and a dropped Redis must never crash it.
        new Redis(config.getOrThrow<string>("REDIS_URL"), { maxRetriesPerRequest: null }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
