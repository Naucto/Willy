import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { sanitizeComposeYaml } from "./compose.service";

describe("sanitizeComposeYaml", () => {
  it("strips container_name from every service and the obsolete top-level version", () => {
    const raw = [
      "version: '3.8'",
      "services:",
      "  web:",
      "    image: nginx",
      "    container_name: pastebin",
      "  worker:",
      "    image: busybox",
      "    container_name: pastebin-worker",
    ].join("\n");

    const { yaml, services } = sanitizeComposeYaml(raw);
    const parsed = parse(yaml) as {
      version?: unknown;
      services: Record<string, Record<string, unknown>>;
    };

    expect(services).toEqual(["web", "worker"]);
    expect(parsed.version).toBeUndefined();
    expect(parsed.services.web).not.toHaveProperty("container_name");
    expect(parsed.services.worker).not.toHaveProperty("container_name");
    // Other keys are preserved.
    expect(parsed.services.web).toMatchObject({ image: "nginx" });
  });

  it("reports declared healthchecks and leaves them on the service", () => {
    const raw = [
      "services:",
      "  api:",
      "    image: api",
      "    healthcheck:",
      "      test: ['CMD', 'curl', '-f', 'http://localhost/health']",
      "  db:",
      "    image: postgres",
    ].join("\n");

    const { services, healthchecks } = sanitizeComposeYaml(raw);

    expect(services).toEqual(["api", "db"]);
    expect(healthchecks).toHaveProperty("api");
    expect(healthchecks).not.toHaveProperty("db");
  });

  it("strips published ports (short and long syntax) and reports the services", () => {
    const raw = [
      "services:",
      "  web:",
      "    image: nginx",
      "    ports:",
      "      - '3000:3000'",
      "  api:",
      "    image: api",
      "    ports:",
      "      - published: 8080",
      "        target: 80",
      "  worker:",
      "    image: busybox",
    ].join("\n");

    const { yaml, strippedPorts } = sanitizeComposeYaml(raw);
    const parsed = parse(yaml) as { services: Record<string, Record<string, unknown>> };

    expect(strippedPorts).toEqual(["web", "api"]);
    expect(parsed.services.web).not.toHaveProperty("ports");
    expect(parsed.services.api).not.toHaveProperty("ports");
    // Unrelated keys survive, and a service without ports is left alone.
    expect(parsed.services.web).toMatchObject({ image: "nginx" });
    expect(parsed.services.worker).toMatchObject({ image: "busybox" });
  });

  it("reports no stripped ports when nothing publishes a host port", () => {
    const raw = ["services:", "  web:", "    image: nginx"].join("\n");

    expect(sanitizeComposeYaml(raw).strippedPorts).toEqual([]);
  });

  it("returns empty results for a file with no services", () => {
    expect(sanitizeComposeYaml("networks:\n  default: {}\n")).toMatchObject({
      services: [],
      healthchecks: {},
    });
  });
});
