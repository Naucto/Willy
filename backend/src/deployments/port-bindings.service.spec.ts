import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { CryptoService } from "../crypto/crypto.service";
import type { Database } from "../db/db.module";
import { DeploymentsService, type PortBinding } from "./deployments.service";

const crypto = {} as unknown as CryptoService;

// A Drizzle-ish select chain that is both awaitable (allocatedHostPorts awaits `.from()`) and
// supports `.from().where().limit()` (assertHostPortFree). `insert().values().returning()` covers
// the write path.
function makeDb(selectRows: unknown[], insertRows: unknown[] = []): Database {
  const chain = Object.assign(Promise.resolve(selectRows), {
    where: () => ({ limit: () => Promise.resolve(selectRows) }),
  });

  return {
    select: () => ({ from: () => chain }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve(insertRows) }) }),
  } as unknown as Database;
}

describe("DeploymentsService.suggestFreePort", () => {
  it("returns the lowest free port in the range", async () => {
    const service = new DeploymentsService(
      makeDb([{ hostPort: 20000 }, { hostPort: 20002 }]),
      crypto,
    );

    await expect(service.suggestFreePort({ start: 20000, end: 20005 })).resolves.toBe(20001);
  });

  it("returns the start when nothing is allocated", async () => {
    const service = new DeploymentsService(makeDb([]), crypto);

    await expect(service.suggestFreePort({ start: 20000, end: 20005 })).resolves.toBe(20000);
  });

  it("throws when the range is exhausted", async () => {
    const taken = [{ hostPort: 20000 }, { hostPort: 20001 }];
    const service = new DeploymentsService(makeDb(taken), crypto);

    await expect(service.suggestFreePort({ start: 20000, end: 20001 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("DeploymentsService.addPortBinding", () => {
  it("rejects a host port already bound", async () => {
    const service = new DeploymentsService(makeDb([{ id: "other-binding" }]), crypto);

    await expect(service.addPortBinding("dom-1", { hostPort: 20001 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("inserts and returns the binding when the port is free", async () => {
    const row: PortBinding = {
      id: "pb-1",
      domainId: "dom-1",
      hostPort: 20001,
      targetService: "rtc-1",
      targetPort: 5001,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const service = new DeploymentsService(makeDb([], [row]), crypto);

    await expect(
      service.addPortBinding("dom-1", {
        hostPort: 20001,
        targetService: "rtc-1",
        targetPort: 5001,
      }),
    ).resolves.toEqual(row);
  });
});
