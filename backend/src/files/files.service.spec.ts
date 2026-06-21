import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { ContainersService } from "../containers/containers.service";
import type { DeploymentsService } from "../deployments/deployments.service";
import type {
  ExecResult,
  HelperHandle,
  VolumeHelperService,
} from "../docker/volume-helper.service";
import { FilesService } from "./files.service";

type ExecFn = (cmd: string[]) => ExecResult;

function makeService(exec: ExecFn, volumes: string[] = ["data"]) {
  const handle: HelperHandle = {
    containerId: "c1",
    exec: (cmd) => Promise.resolve(exec(cmd)),
    getArchive: vi.fn(),
    putArchive: vi.fn(),
  };

  const helpers = {
    withHelper: (_deploymentId: string, _volume: string, fn: (h: HelperHandle) => unknown) =>
      fn(handle),
    beginStream: (_deploymentId: string, _volume: string, fn: (h: HelperHandle) => unknown) =>
      fn(handle),
  } as unknown as VolumeHelperService;

  const deployments = {
    findById: vi.fn().mockResolvedValue({ id: "d1" }),
  } as unknown as DeploymentsService;

  const containers = {
    listForDeployment: vi.fn().mockResolvedValue([{ volumes: volumes.map((name) => ({ name })) }]),
  } as unknown as ContainersService;

  const config = { get: () => undefined } as unknown as ConfigService;

  return new FilesService(helpers, deployments, containers, config);
}

describe("FilesService.resolve", () => {
  it("rejects a volume that does not belong to the deployment", async () => {
    const service = makeService(() => ({ stdout: "", stderr: "", exitCode: 0 }));

    await expect(service.list("d1", "willy_backups", "/")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("FilesService.list", () => {
  it("parses find + stat into typed, dir-first entries", async () => {
    const exec: ExecFn = (cmd) => {
      if (cmd[0] === "find") {
        return { stdout: "/mnt/b.txt\0/mnt/sub", stderr: "", exitCode: 0 };
      }

      // stat: directories end without ".txt"; one line per path, in order.
      const paths = cmd.slice(3);
      const stdout = paths
        .map((path) =>
          path.endsWith(".txt") ? "81a4|12|1000|1000|1700000000" : "41ed|4096|0|0|1700000000",
        )
        .join("\n");

      return { stdout, stderr: "", exitCode: 0 };
    };

    const entries = await makeService(exec).list("d1", "data", "/");

    expect(entries.map((entry) => entry.name)).toEqual(["sub", "b.txt"]);
    expect(entries[0]).toMatchObject({ type: "dir", mode: "0755", modeHuman: "rwxr-xr-x" });
    expect(entries[1]).toMatchObject({ type: "file", mode: "0644", uid: 1000, gid: 1000 });
  });
});

describe("FilesService.write", () => {
  it("refuses to write the volume root", async () => {
    const service = makeService(() => ({ stdout: "", stderr: "", exitCode: 0 }));

    await expect(service.write("d1", "data", "/", "", true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("FilesService.identities", () => {
  it("parses /etc/passwd and /etc/group, deduped and id-sorted", async () => {
    const exec: ExecFn = (cmd) => {
      if (cmd[1] === "/mnt/etc/passwd") {
        return {
          stdout: "root:x:0:0:root:/root:/bin/sh\napp:x:1000:1000::/home/app:/bin/sh\n",
          stderr: "",
          exitCode: 0,
        };
      }

      return { stdout: "root:x:0:\napp:x:1000:\n", stderr: "", exitCode: 0 };
    };

    const result = await makeService(exec).identities("d1", "data");

    expect(result.users).toEqual([
      { id: 0, name: "root" },
      { id: 1000, name: "app" },
    ]);
    expect(result.groups).toEqual([
      { id: 0, name: "root" },
      { id: 1000, name: "app" },
    ]);
  });

  it("returns empty lists when the volume has no passwd/group files", async () => {
    const exec: ExecFn = () => ({ stdout: "", stderr: "no such file", exitCode: 1 });

    const result = await makeService(exec).identities("d1", "data");

    expect(result).toEqual({ users: [], groups: [] });
  });
});
