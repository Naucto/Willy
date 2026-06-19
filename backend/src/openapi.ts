import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

// Placeholders so env validation passes. Must run BEFORE app.module is imported,
// since ConfigModule.forRoot() validates at module-evaluation time. Preview mode
// never executes providers, so these values are only here to satisfy the schema.
process.env.DATABASE_URL ??= "postgres://placeholder";
process.env.REDIS_URL ??= "redis://placeholder";
process.env.WILLY_MASTER_KEY ??= "0".repeat(64);
process.env.JWT_SECRET ??= "0".repeat(32);
process.env.JWT_REFRESH_SECRET ??= "0".repeat(32);

async function generate(): Promise<void> {
  const { AppModule } = await import("./app.module");

  // Preview mode builds the module graph for introspection without instantiating
  // providers (no DB pool, no admin seed) — exactly what doc generation needs.
  const app = await NestFactory.create(AppModule, { preview: true, abortOnError: false });

  const config = new DocumentBuilder()
    .setTitle("Willy API")
    .setVersion("0.0.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outPath = join(__dirname, "..", "openapi.json");
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();
  // Preview-mode context can keep the loop alive; exit explicitly.
  process.exit(0);
}

generate().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
