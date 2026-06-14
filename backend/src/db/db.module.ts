import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const DB = Symbol("WILLY_DB");

export type Database = NodePgDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Database => {
        const pool = new Pool({ connectionString: config.getOrThrow<string>("DATABASE_URL") });

        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
