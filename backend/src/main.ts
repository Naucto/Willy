import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Health probes stay un-prefixed so the container healthcheck can hit /health directly.
  app.setGlobalPrefix("api", { exclude: ["health", "health/ready"] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Willy API")
    .setVersion("0.0.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
