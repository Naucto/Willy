import { describe, expect, it } from "vitest";
import type { Container, DeploymentDomain, PortBinding } from "../api/types";
import { exposedPortsFor, hostPortInRange, serviceOptionsFor, toRows } from "./domainRoutes";

function binding(over: Partial<PortBinding>): PortBinding {
  return {
    id: "b1",
    hostPort: 10001,
    targetService: null,
    targetPort: null,
    ...over,
  } as PortBinding;
}

function domain(over: Partial<DeploymentDomain>): DeploymentDomain {
  return {
    id: "d1",
    fqdn: "app.example.com",
    isPrimary: false,
    webRoute: true,
    targetService: null,
    targetPort: null,
    bindings: [],
    ...over,
  } as DeploymentDomain;
}

function container(over: Partial<Container>): Container {
  return {
    service: "",
    exposedPorts: [],
    running: true,
    image: "img",
    ...over,
  } as unknown as Container;
}

describe("toRows", () => {
  it("emits a web row for a domain with a web route", () => {
    const rows = toRows([domain({ id: "d1", isPrimary: true })]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "d1:web", kind: "web", isPrimary: true, hostPort: null });
  });

  it("emits one row per binding, plus the web row when present", () => {
    const rows = toRows([
      domain({
        id: "d1",
        webRoute: true,
        bindings: [binding({ id: "b1", hostPort: 10001 }), binding({ id: "b2", hostPort: 10002 })],
      }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(["web", "port", "port"]);
    expect(rows.map((r) => r.id)).toEqual(["d1:web", "b1", "b2"]);
    expect(rows[1]).toMatchObject({ kind: "port", hostPort: 10001, bindingId: "b1" });
  });

  it("omits the web row for a port-only domain", () => {
    const rows = toRows([domain({ webRoute: false, bindings: [binding({ id: "b1" })] })]);

    expect(rows.map((r) => r.kind)).toEqual(["port"]);
  });
});

describe("exposedPortsFor", () => {
  it("uses the first container for non-compose", () => {
    const containers = [
      container({ exposedPorts: [3000, 3001] }),
      container({ exposedPorts: [9] }),
    ];

    expect(exposedPortsFor(containers, false, "", "")).toEqual([3000, 3001]);
  });

  it("matches the wanted service for compose, falling back to the default service", () => {
    const containers = [
      container({ service: "web", exposedPorts: [80] }),
      container({ service: "api", exposedPorts: [4000] }),
    ];

    expect(exposedPortsFor(containers, true, "api", "web")).toEqual([4000]);
    expect(exposedPortsFor(containers, true, "", "web")).toEqual([80]);
    expect(exposedPortsFor(containers, true, "missing", "web")).toEqual([]);
  });
});

describe("serviceOptionsFor", () => {
  it("always leads with a default option and dedupes service names", () => {
    const options = serviceOptionsFor(
      "web",
      [container({ service: "web" }), container({ service: "api" })],
      [domain({ targetService: "api" }), domain({ targetService: "worker" })],
    );

    expect(options[0]).toEqual({ value: "", label: "default (web)" });
    expect(options.map((o) => o.value)).toEqual(["", "web", "api", "worker"]);
  });

  it("labels the default plainly when there is no default service", () => {
    expect(serviceOptionsFor("", [], [])[0]).toEqual({ value: "", label: "default" });
  });
});

describe("hostPortInRange", () => {
  it("accepts integers inside the inclusive range only", () => {
    const range = { start: 10000, end: 10019 };

    expect(hostPortInRange(10000, range)).toBe(true);
    expect(hostPortInRange(10019, range)).toBe(true);
    expect(hostPortInRange(9999, range)).toBe(false);
    expect(hostPortInRange(10020, range)).toBe(false);
    expect(hostPortInRange(10000.5, range)).toBe(false);
    expect(hostPortInRange(10000, null)).toBe(false);
  });
});
