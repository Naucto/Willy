import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../db/db.module";
import { type Task, TasksService } from "./tasks.service";

const finished: Task = {
  id: "t1",
  kind: "DEPLOY",
  status: "SUCCESS",
  title: "Deploy",
  deploymentId: null,
  backupId: null,
  actorId: null,
  progress: 100,
  errorMessage: null,
  startedAt: new Date(),
  finishedAt: new Date(),
  createdAt: new Date(),
};

// Minimal stand-in for the Drizzle fluent builder used by clear()/clearFinished().
function fakeDb(rows: Task[]) {
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const db = {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
    }),
    delete: () => ({ where: deleteWhere }),
  } as unknown as Database;

  return { service: new TasksService(db), deleteWhere };
}

describe("TasksService.clear", () => {
  it("deletes a finished task", async () => {
    const { service, deleteWhere } = fakeDb([finished]);

    await service.clear("t1");

    expect(deleteWhere).toHaveBeenCalledOnce();
  });

  it("refuses to clear a running task", async () => {
    const { service, deleteWhere } = fakeDb([{ ...finished, status: "RUNNING" }]);

    await expect(service.clear("t1")).rejects.toBeInstanceOf(ConflictException);
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("404s when the task is missing", async () => {
    const { service, deleteWhere } = fakeDb([]);

    await expect(service.clear("nope")).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteWhere).not.toHaveBeenCalled();
  });
});

describe("TasksService.clearFinished", () => {
  it("issues a delete for finished rows", async () => {
    const { service, deleteWhere } = fakeDb([]);

    await service.clearFinished();

    expect(deleteWhere).toHaveBeenCalledOnce();
  });
});

// Captures the predicate handed to .where() so we can tell a deployment-scoped query from a global one.
function listDb(rows: Task[]) {
  let captured: unknown;
  const afterOrder = Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) });
  const db = {
    select: () => ({
      from: () => ({
        where: (arg: unknown) => {
          captured = arg;

          return { orderBy: () => afterOrder };
        },
      }),
    }),
  } as unknown as Database;

  return { service: new TasksService(db), captured: () => captured };
}

describe("TasksService.list", () => {
  it("applies no predicate when unscoped", async () => {
    const { service, captured } = listDb([finished]);

    await service.list({ scope: "recent" });

    expect(captured()).toBeUndefined();
  });

  it("filters by deployment when given", async () => {
    const { service, captured } = listDb([finished]);

    await service.list({ scope: "recent", deploymentId: "d1" });

    expect(captured()).toBeDefined();
  });
});
