import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module";

// A 6-digit TOTP is only brute-forceable if an attacker can make many guesses. The per-IP throttle on
// the auth endpoints is evadable with rotating IPs, so we also cap failures *per account*: after
// MAX_ATTEMPTS bad codes inside the window, the account's 2FA step is refused until the window passes.
// Combined with TOTP's 30s rotation this makes online brute force infeasible without locking the user
// out permanently (fixed window, not sliding, so an attacker can't keep a victim locked indefinitely).
const MAX_ATTEMPTS = 5;
const WINDOW_SEC = 15 * 60;

export function twoFactorFailureKey(userId: string): string {
  return `2fa:fail:${userId}`;
}

@Injectable()
export class TwoFactorLockoutService {
  private readonly logger = new Logger(TwoFactorLockoutService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async assertNotLockedOut(userId: string): Promise<void> {
    if ((await this.currentFailures(userId)) >= MAX_ATTEMPTS) {
      throw new UnauthorizedException("too many failed 2FA attempts — try again later");
    }
  }

  async recordFailure(userId: string): Promise<void> {
    try {
      const key = twoFactorFailureKey(userId);
      const count = await this.redis.incr(key);

      // Anchor the window to the first failure so the lockout self-clears (fixed, not sliding).
      if (count === 1) {
        await this.redis.expire(key, WINDOW_SEC);
      }
    } catch (error) {
      this.logger.warn(`2FA failure counter unavailable: ${message(error)}`);
    }
  }

  async clear(userId: string): Promise<void> {
    try {
      await this.redis.del(twoFactorFailureKey(userId));
    } catch (error) {
      this.logger.warn(`2FA failure counter clear failed: ${message(error)}`);
    }
  }

  // Fail open on a Redis outage: a counter we can't read must not lock everyone out. The TOTP check
  // itself still gates the request.
  private async currentFailures(userId: string): Promise<number> {
    try {
      const raw = await this.redis.get(twoFactorFailureKey(userId));

      return raw ? Number.parseInt(raw, 10) : 0;
    } catch (error) {
      this.logger.warn(`2FA lockout check unavailable, allowing: ${message(error)}`);

      return 0;
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
