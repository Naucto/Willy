import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { ConfigError } from "../common/errors";

// One-shot migration runner. Invoked from the container entrypoint before the server starts,
// so migrations never race the application process.
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new ConfigError("DATABASE_URL is required to run migrations");
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();

  console.log("migrations applied");
}

main().catch((error: unknown) => {
  console.error("migration failed:", error);
  process.exit(1);
});
