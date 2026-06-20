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
  name?: string | null;
}

export interface UpdateUserInput {
  email?: string;
  name?: string | null;
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
        name: input.name ?? null,
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
  async createWithPassword(
    email: string,
    password: string,
    role: Role,
    name?: string | null,
  ): Promise<User> {
    if (await this.findByEmail(email)) {
      throw new ConflictException("a user with that email already exists");
    }

    return this.create({
      email,
      role,
      name: name ?? null,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    });
  }

  // Admin profile edit: name/email/role. Email moves are guarded against collisions.
  async update(id: string, input: UpdateUserInput): Promise<User> {
    if (input.email !== undefined) {
      const existing = await this.findByEmail(input.email);

      if (existing && existing.id !== id) {
        throw new ConflictException("a user with that email already exists");
      }
    }

    const changes: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

    if (input.email !== undefined) {
      changes.email = input.email;
    }

    if (input.name !== undefined) {
      changes.name = input.name;
    }

    if (input.role !== undefined) {
      changes.role = input.role;
    }

    const rows = await this.db.update(users).set(changes).where(eq(users.id, id)).returning();
    const user = rows[0];

    if (!user) {
      throw new DatabaseError("user update returned no row");
    }

    return user;
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

  async setTwoFactor(
    id: string,
    input: { enabled?: boolean; secret?: string | null },
  ): Promise<void> {
    const changes: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

    if (input.enabled !== undefined) {
      changes.twoFactorEnabled = input.enabled;
    }

    if (input.secret !== undefined) {
      changes.twoFactorSecret = input.secret;
    }

    await this.db.update(users).set(changes).where(eq(users.id, id));
  }

  async setRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.db
      .update(users)
      .set({ refreshTokenHash: hash, updatedAt: new Date() })
      .where(eq(users.id, id));
  }
}
