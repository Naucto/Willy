import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { LabelGeneratorService, OWNER_LABEL, groupRoutes } from "./label-generator.service";

// LabelGeneratorService reads BASE_DOMAIN to decide which routers ride the wildcard cert.
const make = (baseDomain = "willy.naucto.net") =>
  new LabelGeneratorService({ get: () => baseDomain } as unknown as ConfigService);

describe("LabelGeneratorService", () => {
  const service = make();

  it("groups domains that share a (service, port) into one router with an OR rule", () => {
    const labels = service.forWebRoutes({
      deploymentId: "dep-1",
      routerPrefix: "blog",
      network: "willy_edge",
      priority: 1000,
      groups: [
        { service: null, port: 8080, hosts: ["blog.willy.naucto.net", "www.blog.naucto.net"] },
      ],
    });

    expect(labels["traefik.enable"]).toBe("true");
    expect(labels["traefik.http.routers.blog-app-8080.rule"]).toBe(
      "Host(`blog.willy.naucto.net`) || Host(`www.blog.naucto.net`)",
    );
    expect(labels["traefik.http.routers.blog-app-8080.tls.certresolver"]).toBe("ovh");
    expect(labels["traefik.http.routers.blog-app-8080.priority"]).toBe("1000");
    expect(labels["traefik.http.services.blog-app-8080.loadbalancer.server.port"]).toBe("8080");
    expect(labels[OWNER_LABEL]).toBe("dep-1");
  });

  it("emits a distinct router/service per compose service and port", () => {
    const labels = service.forWebRoutes({
      deploymentId: "dep-1",
      routerPrefix: "stack",
      network: "willy_edge",
      priority: 1000,
      groups: [
        { service: "frontend", port: 80, hosts: ["app.example.com"] },
        { service: "backend", port: 4000, hosts: ["api.example.com"] },
      ],
    });

    expect(labels["traefik.http.routers.stack-frontend-80.rule"]).toBe("Host(`app.example.com`)");
    expect(labels["traefik.http.services.stack-frontend-80.loadbalancer.server.port"]).toBe("80");
    expect(labels["traefik.http.routers.stack-backend-4000.rule"]).toBe("Host(`api.example.com`)");
    expect(labels["traefik.http.services.stack-backend-4000.loadbalancer.server.port"]).toBe(
      "4000",
    );
  });

  it("omits the certresolver for base-domain subdomains (served by the wildcard)", () => {
    const labels = make("willy.naucto.net").forWebRoutes({
      deploymentId: "dep-1",
      routerPrefix: "blog",
      network: "willy_edge",
      priority: 1000,
      groups: [{ service: null, port: 8080, hosts: ["blog.willy.naucto.net"] }],
    });

    expect(labels["traefik.http.routers.blog-app-8080.tls"]).toBe("true");
    expect(labels["traefik.http.routers.blog-app-8080.tls.certresolver"]).toBeUndefined();
  });

  it("keeps per-domain ovh issuance for custom external domains", () => {
    const labels = make("willy.naucto.net").forWebRoutes({
      deploymentId: "dep-1",
      routerPrefix: "shop",
      network: "willy_edge",
      priority: 1000,
      groups: [{ service: null, port: 80, hosts: ["shop.acme.com"] }],
    });

    expect(labels["traefik.http.routers.shop-app-80.tls.certresolver"]).toBe("ovh");
  });

  it("treats deeper labels under the base domain as not wildcard-covered", () => {
    const labels = make("willy.naucto.net").forWebRoutes({
      deploymentId: "dep-1",
      routerPrefix: "deep",
      network: "willy_edge",
      priority: 1000,
      groups: [{ service: null, port: 80, hosts: ["a.b.willy.naucto.net"] }],
    });

    // *.willy.naucto.net covers one label only, so a two-label host needs its own cert.
    expect(labels["traefik.http.routers.deep-app-80.tls.certresolver"]).toBe("ovh");
  });

  it("emits only the owner label for non-web deployments", () => {
    const labels = service.forNonWeb("dep-2");

    expect(labels).toEqual({ [OWNER_LABEL]: "dep-2" });
  });
});

describe("groupRoutes", () => {
  it("collapses domains by resolved (service, port), applying defaults", () => {
    const groups = groupRoutes(
      [
        { fqdn: "a.com", targetService: null, targetPort: null },
        { fqdn: "b.com", targetService: "backend", targetPort: 4000 },
        { fqdn: "c.com", targetService: "backend", targetPort: 4000 },
      ],
      { defaultService: "frontend", defaultPort: 80 },
    );

    expect(groups).toEqual([
      { service: "frontend", port: 80, hosts: ["a.com"] },
      { service: "backend", port: 4000, hosts: ["b.com", "c.com"] },
    ]);
  });

  it("keeps a single container (null service) and groups only by port", () => {
    const groups = groupRoutes(
      [
        { fqdn: "a.com", targetService: "ignored", targetPort: null },
        { fqdn: "metrics.com", targetService: null, targetPort: 9090 },
      ],
      { defaultService: null, defaultPort: 3000 },
    );

    expect(groups).toEqual([
      { service: null, port: 3000, hosts: ["a.com"] },
      { service: null, port: 9090, hosts: ["metrics.com"] },
    ]);
  });
});
