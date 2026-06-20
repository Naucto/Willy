import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Database } from "../db/db.module";
import { type User, UsersService } from "./users.service";

const baseUser: User = {
  id: "u1",
  email: "a@b.c",
  name: null,
  passwordHash: "",
  role: "VIEWER",
  twoFactorEnabled: false,
  twoFactorSecret: null,
  refreshTokenHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Minimal stand-in for the two Drizzle chains UsersService.update touches:
//   select().from().where().limit()  → email-collision lookup
//   update().set().where().returning() → the write
function makeDb(findRows: User[], updateRows: User[]): Database {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(findRows) }) }),
    }),
    update: () => ({
      set: () => ({ where: () => ({ returning: () => Promise.resolve(updateRows) }) }),
    }),
  } as unknown as Database;
}

describe("UsersService.update", () => {
  it("applies name, email and role and returns the row", async () => {
    const updated: User = { ...baseUser, name: "Ada", email: "ada@b.c", role: "ADMIN" };
    const service = new UsersService(makeDb([], [updated]));

    const result = await service.update("u1", { name: "Ada", email: "ada@b.c", role: "ADMIN" });

    expect(result).toEqual(updated);
  });

  it("rejects an email already taken by another user", async () => {
    const service = new UsersService(
      makeDb([{ ...baseUser, id: "other", email: "taken@b.c" }], []),
    );

    await expect(service.update("u1", { email: "taken@b.c" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("allows keeping the same email (collision is the same user)", async () => {
    const updated: User = { ...baseUser, name: "Ada" };
    const service = new UsersService(makeDb([baseUser], [updated]));

    const result = await service.update("u1", { email: baseUser.email, name: "Ada" });

    expect(result).toEqual(updated);
  });
});
