import { ConflictException, Inject, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { eq } from "drizzle-orm";
import { DatabaseError } from "../common/errors";
import { type Database, DB } from "../db/db.module";
import { users } from "../db/schema";

export type User = typeof users.$inferSelect;
export type Role = User["role"];

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role?: Role;
}

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);

    return rows[0];
  }

  async findById(id: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);

    return rows[0];
  }

  async create(input: CreateUserInput): Promise<User> {
    const rows = await this.db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role ?? "VIEWER",
      })
      .returning();

    const user = rows[0];

    if (!user) {
      throw new DatabaseError("user insert returned no row");
    }

    return user;
  }

  async list(): Promise<User[]> {
    return this.db.select().from(users);
  }

  // Admin user management: hash the password here so callers never touch argon2.
  async createWithPassword(email: string, password: string, role: Role): Promise<User> {
    if (await this.findByEmail(email)) {
      throw new ConflictException("a user with that email already exists");
    }

    return this.create({
      email,
      role,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    });
  }

  async setRole(id: string, role: Role): Promise<void> {
    await this.db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async setPassword(id: string, password: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        // Force re-login everywhere after a password change.
        refreshTokenHash: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, id));
  }

  async setRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.db
      .update(users)
      .set({ refreshTokenHash: hash, updatedAt: new Date() })
      .where(eq(users.id, id));
  }
}
