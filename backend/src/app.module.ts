import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { validateEnv } from "./config/env.validation";
import { CryptoModule } from "./crypto/crypto.module";
import { DbModule } from "./db/db.module";
import { DockerModule } from "./docker/docker.module";
import { HealthModule } from "./health/health.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    CryptoModule,
    DockerModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}
