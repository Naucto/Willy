import { Inject, Injectable } from "@nestjs/common";
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

  async setRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.db
      .update(users)
      .set({ refreshTokenHash: hash, updatedAt: new Date() })
      .where(eq(users.id, id));
  }
}
