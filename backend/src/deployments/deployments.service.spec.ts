import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { CryptoService } from "../crypto/crypto.service";
import type { Database } from "../db/db.module";
import { DeploymentsService } from "./deployments.service";
import type { DomainsService } from "./domains.service";

// A Drizzle-ish stub: `select().from().where().limit()` resolves to `clashRows` (the uniqueness
// probe) and `update().set().where().returning()` resolves to `updateRows`.
function makeDb(clashRows: unknown[], updateRows: unknown[]): Database {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(clashRows) }) }),
    }),
    update: () => ({
      set: () => ({ where: () => ({ returning: () => Promise.resolve(updateRows) }) }),
    }),
  } as unknown as Database;
}

function makeService(db: Database): DeploymentsService {
  return new DeploymentsService(db, {} as CryptoService, {} as DomainsService);
}

describe("DeploymentsService.rename", () => {
  it("throws Conflict when the name belongs to a different deployment", async () => {
    const service = makeService(makeDb([{ id: "other-dep" }], []));

    await expect(service.rename("dep-1", "taken")).rejects.toBeInstanceOf(ConflictException);
  });

  it("renames when the name is free", async () => {
    const renamed = { id: "dep-1", name: "fresh" };
    const service = makeService(makeDb([], [renamed]));

    await expect(service.rename("dep-1", "fresh")).resolves.toMatchObject({ name: "fresh" });
  });

  it("allows renaming to the same name (clash row is the deployment itself)", async () => {
    const renamed = { id: "dep-1", name: "same" };
    const service = makeService(makeDb([{ id: "dep-1" }], [renamed]));

    await expect(service.rename("dep-1", "same")).resolves.toMatchObject({ name: "same" });
  });
});
