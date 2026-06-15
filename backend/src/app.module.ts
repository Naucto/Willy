import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth/auth.module";
import { BackupsModule } from "./backups/backups.module";
import { BuildModule } from "./build/build.module";
import { validateEnv } from "./config/env.validation";
import { ConsoleModule } from "./console/console.module";
import { CryptoModule } from "./crypto/crypto.module";
import { DbModule } from "./db/db.module";
import { DeploymentsModule } from "./deployments/deployments.module";
import { DnsModule } from "./dns/dns.module";
import { DockerModule } from "./docker/docker.module";
import { EnvVarsModule } from "./env-vars/env-vars.module";
import { GitModule } from "./git/git.module";
import { HealthModule } from "./health/health.module";
import { LogStorageModule } from "./logs/log-storage.module";
import { LogsModule } from "./logs/logs.module";
import { OvhModule } from "./ovh/ovh.module";
import { ReconcileModule } from "./reconcile/reconcile.module";
import { SystemModule } from "./system/system.module";
import { TraefikModule } from "./traefik/traefik.module";
import { UsersModule } from "./users/users.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    DbModule,
    CryptoModule,
    DockerModule,
    LogStorageModule,
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
    OvhModule,
    DnsModule,
    BackupsModule,
  ],
})
export class AppModule {}
