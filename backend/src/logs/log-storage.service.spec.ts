import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigService } from "@nestjs/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LogStorageService } from "./log-storage.service";

function makeService(dir: string): LogStorageService {
  const config = { get: (key: string) => (key === "LOGS_DIR" ? dir : undefined) };

  return new LogStorageService(config as unknown as ConfigService);
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

describe("LogStorageService", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "willy-logs-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("replays buffered lines for a live stream", async () => {
    const logs = makeService(dir);
    logs.append("builds/r1", "one");
    logs.append("builds/r1", "two");

    expect(await logs.history("builds/r1")).toEqual(["one", "two"]);
    expect(logs.isLive("builds/r1")).toBe(true);
  });

  it("persists history so a fresh instance (a restart) can replay it", async () => {
    const logs = makeService(dir);
    logs.append("runtime/d1/default", "boot line");
    logs.finish("runtime/d1/default");
    await tick();

    const afterRestart = makeService(dir);
    expect(await afterRestart.history("runtime/d1/default")).toEqual(["boot line"]);
    // Cold (no in-memory buffer) → replay-only.
    expect(afterRestart.isLive("runtime/d1/default")).toBe(false);
  });

  it("fans out live lines to subscribers", async () => {
    const logs = makeService(dir);
    const seen: string[] = [];
    const detach = logs.onLine("builds/r2", (line) => seen.push(line));
    logs.append("builds/r2", "a");
    logs.append("builds/r2", "b");
    detach();
    logs.append("builds/r2", "c");

    expect(seen).toEqual(["a", "b"]);
  });

  it("keeps keys sandboxed under the log dir", async () => {
    const logs = makeService(dir);
    // A service name with slashes/dots must not escape the directory; it just gets sanitised.
    logs.append("runtime/d1/../../etc/passwd", "x");
    logs.finish("runtime/d1/../../etc/passwd");
    await tick();

    expect(await logs.history("runtime/d1/../../etc/passwd")).toEqual(["x"]);
  });
});
