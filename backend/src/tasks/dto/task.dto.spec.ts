import { describe, expect, it } from "vitest";
import type { Task } from "../tasks.service";
import { toTaskDto } from "./task.dto";

const base: Task = {
  id: "t1",
  kind: "DEPLOY",
  status: "RUNNING",
  title: "Deploy",
  deploymentId: "d1",
  backupId: null,
  actorId: "u1",
  progress: 50,
  errorMessage: null,
  startedAt: new Date("2026-06-18T10:00:00Z"),
  finishedAt: null,
  createdAt: new Date("2026-06-18T09:59:00Z"),
};

describe("toTaskDto", () => {
  it("serializes dates to ISO and drops internal-only fields", () => {
    const dto = toTaskDto(base);

    expect(dto.createdAt).toBe("2026-06-18T09:59:00.000Z");
    expect(dto.finishedAt).toBeNull();
    expect(dto).not.toHaveProperty("actorId");
    expect(dto).not.toHaveProperty("startedAt");
  });

  it("passes through a finished timestamp when present", () => {
    const dto = toTaskDto({
      ...base,
      status: "SUCCESS",
      progress: 100,
      finishedAt: new Date("2026-06-18T10:05:00Z"),
    });

    expect(dto.finishedAt).toBe("2026-06-18T10:05:00.000Z");
    expect(dto.status).toBe("SUCCESS");
  });
});
