import { describe, expect, it } from "vitest";
import {
  INITIAL_WIZARD_STATE,
  stepError,
  stepsFor,
  toPayload,
  type WizardState,
} from "./createDeployment";

function state(overrides: Partial<WizardState>): WizardState {
  return { ...INITIAL_WIZARD_STATE, ...overrides };
}

describe("stepsFor", () => {
  it("gives WEB a Domain step and no build step", () => {
    const keys = stepsFor("WEB").map((s) => s.key);

    expect(keys).toEqual(["type", "source", "domain", "resources", "review"]);
  });

  it("gives WORKER/CRON a build step and no domain step", () => {
    for (const type of ["WORKER", "CRON"] as const) {
      const keys = stepsFor(type).map((s) => s.key);

      expect(keys).toEqual(["type", "source", "build", "resources", "review"]);
    }
  });
});

describe("stepError", () => {
  it("requires a valid name on the type step", () => {
    expect(stepError("type", state({ name: "" }))).toMatch(/required/);
    expect(stepError("type", state({ name: "Bad_Name" }))).toMatch(/lowercase/);
    expect(stepError("type", state({ name: "my-app" }))).toBeNull();
  });

  it("requires the right source field per strategy", () => {
    const image = state({
      source: { ...INITIAL_WIZARD_STATE.source, buildStrategy: "IMAGE", imageRef: "" },
    });
    expect(stepError("source", image)).toMatch(/Image/);

    const git = state({ source: { ...INITIAL_WIZARD_STATE.source, gitUrl: "" } });
    expect(stepError("source", git)).toMatch(/Git URL/);

    const ok = state({ source: { ...INITIAL_WIZARD_STATE.source, gitUrl: "https://x/y.git" } });
    expect(stepError("source", ok)).toBeNull();
  });

  it("rejects an invalid domain only when one is entered and enabled", () => {
    expect(stepError("domain", state({ domainEnabled: false, domain: "not a domain" }))).toBeNull();
    expect(stepError("domain", state({ domainEnabled: true, domain: "" }))).toBeNull();
    expect(stepError("domain", state({ domainEnabled: true, domain: "bad domain" }))).toMatch(
      /valid domain/,
    );
    expect(
      stepError("domain", state({ domainEnabled: true, domain: "app.example.com" })),
    ).toBeNull();
  });
});

describe("toPayload", () => {
  it("omits empty/zero optional fields and trims values", () => {
    const payload = toPayload(
      state({
        name: " my-app ",
        type: "WEB",
        source: { ...INITIAL_WIZARD_STATE.source, gitUrl: " https://x/y.git " },
      }),
    );

    expect(payload).toEqual({
      name: "my-app",
      type: "WEB",
      buildStrategy: "DOCKERFILE",
      gitUrl: "https://x/y.git",
      gitRef: "main",
    });
    expect(payload).not.toHaveProperty("memoryLimitMb");
    expect(payload).not.toHaveProperty("domain");
  });

  it("converts CPU cores to nanoCpus and includes the memory limit", () => {
    const payload = toPayload(state({ name: "a", memoryLimitMb: 512, cpuCores: 1.5 }));

    expect(payload.memoryLimitMb).toBe(512);
    expect(payload.nanoCpus).toBe(1_500_000_000);
  });

  it("includes the domain + port only when enabled with a domain on a WEB deployment", () => {
    const payload = toPayload(
      state({
        name: "a",
        type: "WEB",
        domainEnabled: true,
        domain: "app.x.com",
        domainPort: "8080",
      }),
    );

    expect(payload.domain).toBe("app.x.com");
    expect(payload.domainPort).toBe(8080);
  });

  it("carries the cron expression + command for a CRON deployment", () => {
    const payload = toPayload(
      state({ name: "a", type: "CRON", cronExpr: "0 3 * * *", runCommand: "node job.js" }),
    );

    expect(payload).toMatchObject({
      type: "CRON",
      cronExpr: "0 3 * * *",
      runCommand: "node job.js",
    });
  });
});
