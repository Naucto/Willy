import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  classifyComposeServices,
  sanitizeComposeYaml,
  splitComposeConfig,
} from "./compose.service";

type ComposeDoc = {
  services: Record<string, Record<string, unknown>>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
};

const classifyFull = (raw: string) =>
  classifyComposeServices(parse(raw) as Record<string, unknown>);

// The pinning tests below are about pinning; drop the restart survey so their expectations stay
// about the one thing they exercise.
const classify = (raw: string) => {
  const { eligible, pinned } = classifyFull(raw);

  return { eligible, pinned };
};

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

  it("injects no-new-privileges into every service", () => {
    const raw = ["services:", "  web:", "    image: nginx", "  worker:", "    image: busybox"].join(
      "\n",
    );

    const parsed = parse(sanitizeComposeYaml(raw).yaml) as {
      services: Record<string, { security_opt?: string[] }>;
    };

    expect(parsed.services.web?.security_opt).toEqual(["no-new-privileges:true"]);
    expect(parsed.services.worker?.security_opt).toEqual(["no-new-privileges:true"]);
  });

  it("appends no-new-privileges without clobbering a user's security_opt", () => {
    const raw = [
      "services:",
      "  web:",
      "    image: nginx",
      "    security_opt:",
      "      - seccomp:unconfined",
    ].join("\n");

    const parsed = parse(sanitizeComposeYaml(raw).yaml) as {
      services: Record<string, { security_opt?: string[] }>;
    };

    expect(parsed.services.web?.security_opt).toEqual([
      "seccomp:unconfined",
      "no-new-privileges:true",
    ]);
  });

  it("does not duplicate an existing no-new-privileges entry", () => {
    const raw = [
      "services:",
      "  web:",
      "    image: nginx",
      "    security_opt:",
      "      - no-new-privileges:true",
    ].join("\n");

    const parsed = parse(sanitizeComposeYaml(raw).yaml) as {
      services: Record<string, { security_opt?: string[] }>;
    };

    expect(parsed.services.web?.security_opt).toEqual(["no-new-privileges:true"]);
  });
});

describe("classifyComposeServices", () => {
  it("pins a service with a writable named volume, keeps a stateless one eligible", () => {
    const raw = [
      "services:",
      "  web:",
      "    image: nginx",
      "  db:",
      "    image: postgres",
      "    volumes:",
      "      - pgdata:/var/lib/postgresql/data",
      "volumes:",
      "  pgdata:",
    ].join("\n");

    expect(classify(raw)).toEqual({ eligible: ["web"], pinned: ["db"] });
  });

  it("treats a read-only named volume and an anonymous volume as safe", () => {
    const raw = [
      "services:",
      "  web:",
      "    image: nginx",
      "    volumes:",
      "      - assets:/usr/share/nginx/html:ro",
      "  cache:",
      "    image: redis",
      "    volumes:",
      "      - /data",
      "volumes:",
      "  assets:",
    ].join("\n");

    expect(classify(raw)).toEqual({ eligible: ["web", "cache"], pinned: [] });
  });

  it("pins a writable host bind but not a read-only one", () => {
    const raw = [
      "services:",
      "  rw:",
      "    image: a",
      "    volumes:",
      "      - ./data:/data",
      "  ro:",
      "    image: b",
      "    volumes:",
      "      - ./cfg:/cfg:ro",
    ].join("\n");

    expect(classify(raw)).toEqual({ eligible: ["ro"], pinned: ["rw"] });
  });

  it("reads long-form volume mounts (read_only flag decides)", () => {
    const raw = [
      "services:",
      "  rw:",
      "    image: a",
      "    volumes:",
      "      - { type: volume, source: pgdata, target: /var/lib }",
      "  ro:",
      "    image: b",
      "    volumes:",
      "      - { type: volume, source: assets, target: /assets, read_only: true }",
    ].join("\n");

    expect(classify(raw)).toEqual({ eligible: ["ro"], pinned: ["rw"] });
  });

  it("pins services holding exclusive host resources", () => {
    const raw = [
      "services:",
      "  hostnet: { image: a, network_mode: host }",
      "  priv: { image: b, privileged: true }",
      "  dev: { image: c, devices: ['/dev/snd:/dev/snd'] }",
      "  plain: { image: d }",
    ].join("\n");

    expect(classify(raw)).toEqual({ eligible: ["plain"], pinned: ["hostnet", "priv", "dev"] });
  });

  it("pins any service on a non-default network (v1 rule)", () => {
    const raw = [
      "services:",
      "  app: { image: a, networks: [backend] }",
      "  plain: { image: b }",
      "networks:",
      "  backend: {}",
    ].join("\n");

    expect(classify(raw)).toEqual({ eligible: ["plain"], pinned: ["app"] });
  });

  it("defaults a non-object service value to pinned", () => {
    const raw = ["services:", "  broken: null", "  ok: { image: a }"].join("\n");

    expect(classify(raw)).toEqual({ eligible: ["ok"], pinned: ["broken"] });
  });

  it("reports the services that set their own restart policy, and only those", () => {
    const raw = [
      "services:",
      "  web:",
      "    image: nginx",
      "  worker:",
      "    image: busybox",
      "    restart: always",
      "  once:",
      "    image: busybox",
      '    restart: "no"',
    ].join("\n");

    expect(classifyFull(raw).declaresRestart).toEqual(["worker", "once"]);
  });
});

describe("splitComposeConfig", () => {
  const webDb = [
    "services:",
    "  web:",
    "    image: nginx",
    "    depends_on: [db]",
    "  db:",
    "    image: postgres",
    "    volumes:",
    "      - pgdata:/var/lib/postgresql/data",
    "volumes:",
    "  pgdata:",
  ].join("\n");

  it("puts pinned services + volumes in base and eligible services in release", () => {
    const split = splitComposeConfig(webDb, "blog");

    expect(split).toMatchObject({ eligible: ["web"], pinned: ["db"] });

    const base = parse(split.baseYaml) as ComposeDoc;
    expect(Object.keys(base.services)).toEqual(["db"]);
    expect(base.volumes).toHaveProperty("pgdata");

    const release = parse(split.releaseYaml) as ComposeDoc;
    expect(Object.keys(release.services)).toEqual(["web"]);
    // depends_on on a pinned service is pruned away (db lives in the base project).
    expect(release.services.web).not.toHaveProperty("depends_on");
    expect(release.services.web?.networks).toEqual(["default", "willy_base", "willy_edge"]);
    expect(release.networks).toMatchObject({
      willy_edge: { external: true },
      willy_base: { external: true, name: "willy_blog_default" },
    });
  });

  it("keeps a build secret's declaration with the service that builds it", () => {
    const raw = [
      "services:",
      "  web:",
      "    build:",
      "      context: .",
      "      secrets: [npm_token]",
      "  db:",
      "    image: postgres",
      "    volumes: [pgdata:/var/lib/postgresql/data]",
      "volumes:",
      "  pgdata:",
      "secrets:",
      "  npm_token:",
      "    environment: NPM_TOKEN",
    ].join("\n");

    // The release file is rebuilt from scratch, so a top-level declaration the eligible service
    // still points at has to travel with it — compose otherwise refuses the whole project with
    // "refers to undefined build secret".
    const release = parse(splitComposeConfig(raw, "site").releaseYaml) as ComposeDoc;

    expect(Object.keys(release.services)).toEqual(["web"]);
    expect(release.secrets).toMatchObject({ npm_token: { environment: "NPM_TOKEN" } });
  });

  it("omits the base network link when there are no pinned services", () => {
    const raw = ["services:", "  web: { image: nginx }", "  worker: { image: busybox }"].join("\n");

    const split = splitComposeConfig(raw, "site");

    expect(split.pinned).toEqual([]);
    const release = parse(split.releaseYaml) as ComposeDoc;
    expect(release.services.web?.networks).toEqual(["default", "willy_edge"]);
    expect(release.networks).not.toHaveProperty("willy_base");
  });

  it("pins a read-only named volume on an eligible service to the base-created volume", () => {
    const raw = [
      "services:",
      "  web:",
      "    image: nginx",
      "    volumes:",
      "      - shared:/assets:ro",
      "  db:",
      "    image: postgres",
      "    volumes:",
      "      - pgdata:/data",
      "volumes:",
      "  shared:",
      "  pgdata:",
    ].join("\n");

    const release = parse(splitComposeConfig(raw, "blog").releaseYaml) as ComposeDoc;

    expect(release.volumes).toMatchObject({
      shared: { external: true, name: "willy_blog_shared" },
    });
  });
});
