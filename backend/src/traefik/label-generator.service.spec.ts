import { describe, expect, it } from "vitest";
import { LabelGeneratorService, OWNER_LABEL } from "./label-generator.service";

describe("LabelGeneratorService", () => {
  const service = new LabelGeneratorService();

  it("generates router/service labels for a WEB deployment", () => {
    const labels = service.forWeb({
      deploymentId: "dep-1",
      routerName: "app-blog",
      hosts: ["blog.willy.naucto.net", "www.blog.naucto.net"],
      port: 8080,
      network: "willy_edge",
      priority: 1000,
    });

    expect(labels["traefik.enable"]).toBe("true");
    expect(labels["traefik.http.routers.app-blog.rule"]).toBe(
      "Host(`blog.willy.naucto.net`) || Host(`www.blog.naucto.net`)",
    );
    expect(labels["traefik.http.routers.app-blog.tls.certresolver"]).toBe("ovh");
    expect(labels["traefik.http.routers.app-blog.priority"]).toBe("1000");
    expect(labels["traefik.http.services.app-blog.loadbalancer.server.port"]).toBe("8080");
    expect(labels[OWNER_LABEL]).toBe("dep-1");
  });

  it("emits only the owner label for non-web deployments", () => {
    const labels = service.forNonWeb("dep-2");

    expect(labels).toEqual({ [OWNER_LABEL]: "dep-2" });
  });
});
