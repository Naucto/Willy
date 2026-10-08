import { describe, expect, it } from "vitest";
import { dockerCliEnv } from "./docker-client";

describe("dockerCliEnv", () => {
  it("leaves the builder to BuildKit and keeps its log one line per step", () => {
    const env = dockerCliEnv("tcp://proxy:2375");

    expect(env.DOCKER_BUILDKIT).toBeUndefined();
    expect(env.COMPOSE_BAKE).toBeUndefined();
    expect(env.BUILDKIT_PROGRESS).toBe("plain");
  });

  it("never lets a deployment's own variables move the engine", () => {
    const env = dockerCliEnv("tcp://proxy:2375", { DOCKER_HOST: "tcp://elsewhere:2375", APP: "x" });

    expect(env.DOCKER_HOST).toBe("tcp://proxy:2375");
    expect(env.APP).toBe("x");
  });
});
