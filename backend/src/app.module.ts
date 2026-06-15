import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { BuildModule } from "./build/build.module";
import { validateEnv } from "./config/env.validation";
import { ConsoleModule } from "./console/console.module";
import { CryptoModule } from "./crypto/crypto.module";
import { DbModule } from "./db/db.module";
import { DeploymentsModule } from "./deployments/deployments.module";
import { DockerModule } from "./docker/docker.module";
import { EnvVarsModule } from "./env-vars/env-vars.module";
import { GitModule } from "./git/git.module";
import { HealthModule } from "./health/health.module";
import { LogsModule } from "./logs/logs.module";
import { ReconcileModule } from "./reconcile/reconcile.module";
import { SystemModule } from "./system/system.module";
import { TraefikModule } from "./traefik/traefik.module";
import { UsersModule } from "./users/users.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    CryptoModule,
    DockerModule,
    UsersModule,
    AuthModule,
    HealthModule,
    DeploymentsModule,
    EnvVarsModule,
    GitModule,
    TraefikModule,
    BuildModule,
    LogsModule,
    ReconcileModule,
    WebhooksModule,
    ConsoleModule,
    SystemModule,
  ],
})
export class AppModule {}
