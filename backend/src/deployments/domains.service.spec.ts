import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Database } from "../db/db.module";
import { DomainsService } from "./domains.service";

// A Drizzle-ish stub: `select().from().where().limit()` resolves to `findRows`; `update().set().where()`
// is an awaitable no-op so the primary-swap writes succeed.
function makeDb(findRows: unknown[]): Database {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(findRows) }) }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
  } as unknown as Database;
}

describe("DomainsService.makePrimary", () => {
  it("throws NotFound when the domain does not belong to the deployment", async () => {
    const service = new DomainsService(makeDb([]));

    await expect(service.makePrimary("dep-1", "dom-x")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a port-bind-only domain (no 443 route) as primary", async () => {
    const service = new DomainsService(makeDb([{ id: "dom-1", webRoute: false }]));

    await expect(service.makePrimary("dep-1", "dom-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("promotes a web-serving domain to primary", async () => {
    const service = new DomainsService(makeDb([{ id: "dom-1", webRoute: true }]));

    await expect(service.makePrimary("dep-1", "dom-1")).resolves.toBeUndefined();
  });
});
