import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { UsersController } from "./users.controller";
import type { User, UsersService } from "./users.service";

const admin: AuthUser = { userId: "u1", email: "a@b.c", role: "ADMIN" };
const viewer: AuthUser = { userId: "u2", email: "v@b.c", role: "VIEWER" };

const updated: User = {
  id: "u1",
  email: "a@b.c",
  name: null,
  passwordHash: "",
  role: "ADMIN",
  disabled: false,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  refreshTokenHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeController() {
  const users = {
    update: vi.fn().mockResolvedValue(updated),
    findById: vi.fn().mockResolvedValue(updated),
    setPassword: vi.fn().mockResolvedValue(undefined),
  } as unknown as UsersService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  return { controller: new UsersController(users, audit), users };
}

describe("UsersController.get", () => {
  it("returns the user as a DTO for self", async () => {
    const { controller } = makeController();

    const dto = await controller.get("u1", admin);

    expect(dto.id).toBe("u1");
    expect(dto.twoFactorConfigured).toBe(false);
  });

  it("forbids a non-admin reading another user", async () => {
    const { controller } = makeController();

    await expect(controller.get("u1", viewer)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws when the user is missing", async () => {
    const { controller, users } = makeController();
    vi.mocked(users.findById).mockResolvedValueOnce(undefined);

    await expect(controller.get("u1", admin)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("UsersController.update", () => {
  it("blocks demoting your own account", async () => {
    const { controller } = makeController();

    await expect(controller.update("u1", { role: "VIEWER" }, admin, "ip")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("lets you edit your own name without touching the role", async () => {
    const { controller, users } = makeController();

    await controller.update("u2", { name: "Vi" }, viewer, "ip");

    expect(users.update).toHaveBeenCalledWith("u2", { name: "Vi" });
  });

  it("forbids a non-admin from changing a role", async () => {
    const { controller } = makeController();

    await expect(controller.update("u2", { role: "ADMIN" }, viewer, "ip")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("forbids editing another user without admin", async () => {
    const { controller } = makeController();

    await expect(controller.update("u1", { name: "x" }, viewer, "ip")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("stores a blank name as null", async () => {
    const { controller, users } = makeController();

    await controller.update("u1", { name: "   " }, admin, "ip");

    expect(users.update).toHaveBeenCalledWith("u1", { name: null });
  });
});
