import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { CryptoService } from "../crypto/crypto.service";
import type { Database } from "../db/db.module";
import { DeploymentsService, expandDomainRoutes, type PortBinding } from "./deployments.service";

const domain = (over: Partial<Parameters<typeof expandDomainRoutes>[0][number]> = {}) => ({
  id: "dom-1",
  fqdn: "rtc.example.com",
  webRoute: true,
  targetService: null,
  targetPort: null,
  isPrimary: false,
  ...over,
});

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

describe("expandDomainRoutes", () => {
  const binds = [
    { domainId: "dom-1", hostPort: 20001, targetService: "rtc-a", targetPort: 5001 },
    { domainId: "dom-1", hostPort: 20002, targetService: "rtc-b", targetPort: 5002 },
  ];

  it("emits only port routes for a port-bind-only domain (no 443 route)", () => {
    const routes = expandDomainRoutes([domain({ webRoute: false })], binds);

    expect(routes).toHaveLength(2);
    expect(routes.every((r) => r.hostPort !== null)).toBe(true);
    expect(routes.map((r) => r.hostPort)).toEqual([20001, 20002]);
  });

  it("emits the 443 route plus a route per bind when webRoute is on", () => {
    const routes = expandDomainRoutes([domain({ webRoute: true, targetPort: 8080 })], binds);

    expect(routes).toHaveLength(3);
    const web = routes.filter((r) => r.hostPort === null);
    expect(web).toHaveLength(1);
    expect(web[0]?.targetPort).toBe(8080);
    expect(routes.filter((r) => r.hostPort !== null).map((r) => r.hostPort)).toEqual([
      20001, 20002,
    ]);
  });

  it("orders primary domains first", () => {
    const routes = expandDomainRoutes(
      [
        domain({ id: "a", fqdn: "a.example.com", isPrimary: false }),
        domain({ id: "b", fqdn: "b.example.com", isPrimary: true }),
      ],
      [],
    );

    expect(routes[0]?.fqdn).toBe("b.example.com");
  });
});

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
