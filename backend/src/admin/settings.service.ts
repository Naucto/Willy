import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { appSettings } from "../db/schema";
import type { AppSettingsDto, UpdateAppSettingsDto } from "./dto/app-settings.dto";

// Code-owned defaults: a row in app_settings exists only once a value is overridden.
const DEFAULTS: AppSettingsDto = {
  showAllResources: false,
};

// Overlay the persisted key→value rows onto the code defaults. Unknown keys (e.g. a setting removed
// from a later version) are ignored so the response stays the typed contract.
export function mergeSettings(rows: readonly { key: string; value: unknown }[]): AppSettingsDto {
  const stored = new Map(rows.map((row) => [row.key, row.value]));

  return {
    showAllResources:
      (stored.get("showAllResources") as boolean | undefined) ?? DEFAULTS.showAllResources,
  };
}

@Injectable()
export class SettingsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getAll(): Promise<AppSettingsDto> {
    const rows = await this.db
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings);

    return mergeSettings(rows);
  }

  async update(patch: UpdateAppSettingsDto): Promise<AppSettingsDto> {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);

    for (const [key, value] of entries) {
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
}
