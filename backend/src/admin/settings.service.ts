import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import { type PortRange, parsePortRange, rangeContains } from "../config/port-range";
import { DB, type Database } from "../db/db.module";
import { appSettings } from "../db/schema";
import type {
  AppSettingsDto,
  PortBindingSettingsDto,
  UpdateAppSettingsDto,
} from "./dto/app-settings.dto";

// Code-owned defaults: a row in app_settings exists only once a value is overridden. The
// portBinding sub-range defaults to the full provisioned capacity (overlaid in mergeSettings);
// the feature stays off until an admin explicitly enables it.
const DEFAULTS = {
  showAllResources: false,
};

// Overlay the persisted key→value rows onto the code defaults. Unknown keys (e.g. a setting removed
// from a later version) are ignored so the response stays the typed contract. `capacity` is the
// provisioned host-port range (env), used to default the active sub-range and exposed read-only.
export function mergeSettings(
  rows: readonly { key: string; value: unknown }[],
  capacity: PortRange | null = null,
): AppSettingsDto {
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const storedPortBinding = stored.get("portBinding") as
    | Partial<PortBindingSettingsDto>
    | undefined;

  const portBinding: PortBindingSettingsDto = {
    enabled: storedPortBinding?.enabled ?? false,
    start: storedPortBinding?.start ?? capacity?.start ?? 0,
    end: storedPortBinding?.end ?? capacity?.end ?? 0,
  };

  return {
    showAllResources:
      (stored.get("showAllResources") as boolean | undefined) ?? DEFAULTS.showAllResources,
    portBinding,
    portBindingCapacity: capacity,
  };
}

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  // Provisioned capacity from the env, parsed once per call (null = feature unprovisioned).
  private capacity(): PortRange | null {
    return parsePortRange(this.config.get<string>("WILLY_PORT_BIND_RANGE"));
  }

  async getAll(): Promise<AppSettingsDto> {
    const rows = await this.db
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings);

    return mergeSettings(rows, this.capacity());
  }

  async update(patch: UpdateAppSettingsDto): Promise<AppSettingsDto> {
    const writes: { key: string; value: unknown }[] = [];

    if (patch.showAllResources !== undefined) {
      writes.push({ key: "showAllResources", value: patch.showAllResources });
    }

    // portBinding is stored as one object: merge the partial onto the current effective value and
    // validate the result against the provisioned capacity before persisting.
    if (patch.portBinding !== undefined) {
      const current = await this.getAll();
      const merged: PortBindingSettingsDto = {
        enabled: patch.portBinding.enabled ?? current.portBinding.enabled,
        start: patch.portBinding.start ?? current.portBinding.start,
        end: patch.portBinding.end ?? current.portBinding.end,
      };

      this.assertPortBindingValid(merged);
      writes.push({ key: "portBinding", value: merged });
    }

    for (const { key, value } of writes) {
      await this.db
        .insert(appSettings)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedAt: sql`now()` },
        });
    }

    return this.getAll();
  }

  private assertPortBindingValid(setting: PortBindingSettingsDto): void {
    const capacity = this.capacity();

    if (setting.enabled && !capacity) {
      throw new BadRequestException(
        "host-port binding isn't provisioned (set WILLY_PORT_BIND_RANGE and redeploy)",
      );
    }

    if (setting.start > setting.end) {
      throw new BadRequestException("port range start must be <= end");
    }

    if (capacity && !rangeContains(capacity, { start: setting.start, end: setting.end })) {
      throw new BadRequestException(
        `port range must be within the provisioned capacity ${capacity.start}-${capacity.end}`,
      );
    }
  }
}
