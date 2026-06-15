import { describe, expect, it } from "vitest";
import { LocalDnsError, LocalDnsProvider } from "./local-dns.provider";

describe("LocalDnsProvider", () => {
  it("is always configured and seeds local zones", async () => {
    const dns = new LocalDnsProvider();

    expect(dns.configured).toBe(true);
    expect(await dns.zones()).toContain("willy.localhost");
  });

  it("round-trips create / update / remove", async () => {
    const dns = new LocalDnsProvider();

    const created = await dns.create("example.test", {
      fieldType: "A",
      subDomain: "api",
      target: "10.0.0.1",
    });
    expect(created.ttl).toBe(3600);
    expect(await dns.zones()).toContain("example.test");

    await dns.update("example.test", created.id, { target: "10.0.0.2", ttl: 120 });
    const [record] = await dns.records("example.test");
    expect(record).toMatchObject({ target: "10.0.0.2", ttl: 120, subDomain: "api" });

    await dns.remove("example.test", created.id);
    expect(await dns.records("example.test")).toHaveLength(0);
  });

  it("throws on unknown records", async () => {
    const dns = new LocalDnsProvider();

    await expect(dns.remove("example.test", 999)).rejects.toBeInstanceOf(LocalDnsError);
  });
});
