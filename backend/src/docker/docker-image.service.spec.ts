import { EventEmitter } from "node:events";
import type { ConfigService } from "@nestjs/config";
import type Docker from "dockerode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { DockerImageService, ImageBuildError } from "./docker-image.service";

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function fakeChild(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
}

const config = {
  get: (key: string): unknown => ({ DOCKER_PROXY_HOST: "proxy", DOCKER_PROXY_PORT: 2375 })[key],
} as unknown as ConfigService;

describe("DockerImageService.buildImage", () => {
  let child: FakeChild;
  let service: DockerImageService;

  beforeEach(() => {
    child = fakeChild();
    spawnMock.mockReset().mockReturnValue(child);
    service = new DockerImageService({} as Docker, config);
  });

  it("builds with buildx through the socket-proxy and loads the image", async () => {
    const built = service.buildImage({
      contextDir: "/tmp/build",
      imageTag: "willy/app:abc",
      dockerfile: "docker/Dockerfile.prod",
      buildArgs: { NODE_ENV: "production" },
    });
    child.emit("close", 0);
    await built;

    const [command, args, options] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    expect(command).toBe("docker");
    expect(args).toEqual([
      "buildx",
      "build",
      "--load",
      "--tag",
      "willy/app:abc",
      "--file",
      "/tmp/build/docker/Dockerfile.prod",
      "--build-arg",
      "NODE_ENV=production",
      "/tmp/build",
    ]);
    expect(options.env.DOCKER_HOST).toBe("tcp://proxy:2375");
    expect(options.env.DOCKER_BUILDKIT).not.toBe("0");
  });

  it("relays each line of output and fails on a non-zero exit", async () => {
    const lines: string[] = [];
    const built = service.buildImage({
      contextDir: "/tmp/build",
      imageTag: "willy/app:abc",
      onLog: (line) => lines.push(line),
    });
    child.stdout.emit("data", Buffer.from("#1 [internal] load build definition\n#2 DONE\n"));
    child.stderr.emit("data", Buffer.from("ERROR: failed to solve\n"));
    child.emit("close", 1);

    await expect(built).rejects.toBeInstanceOf(ImageBuildError);
    expect(lines).toEqual([
      "#1 [internal] load build definition",
      "#2 DONE",
      "ERROR: failed to solve",
    ]);
  });
});
