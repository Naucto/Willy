import { describe, expect, it } from "vitest";
import type { Task } from "./api/types";
import { latestTaskByBackup } from "./backupActivity";

function task(partial: Partial<Task>): Task {
  return {
    id: "t",
    kind: "RESTORE",
    status: "SUCCESS",
    title: "",
    deploymentId: "d1",
    backupId: null,
    progress: null,
    errorMessage: null,
    createdAt: "2026-06-20T00:00:00.000Z",
    finishedAt: null,
    ...partial,
  };
}

describe("latestTaskByBackup", () => {
  it("keeps the newest task per backup (first seen wins)", () => {
    const newest = task({ id: "new", backupId: "b1", status: "RUNNING" });
    const older = task({ id: "old", backupId: "b1", status: "SUCCESS" });

    const map = latestTaskByBackup([newest, older]);

    expect(map.get("b1")?.id).toBe("new");
  });

  it("ignores tasks not linked to a backup", () => {
    const map = latestTaskByBackup([task({ id: "x", backupId: null })]);

    expect(map.size).toBe(0);
  });

  it("handles undefined input", () => {
    expect(latestTaskByBackup(undefined).size).toBe(0);
  });
});
