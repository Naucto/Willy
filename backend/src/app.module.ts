import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { BackupsModule } from "./backups/backups.module";
import { BuildModule } from "./build/build.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { validateEnv } from "./config/env.validation";
import { ConsoleModule } from "./console/console.module";
import { CryptoModule } from "./crypto/crypto.module";
import { DbModule } from "./db/db.module";
import { DeploymentsModule } from "./deployments/deployments.module";
import { DnsModule } from "./dns/dns.module";
import { DockerModule } from "./docker/docker.module";
import { EnvVarsModule } from "./env-vars/env-vars.module";
import { FilesModule } from "./files/files.module";
import { GitModule } from "./git/git.module";
import { HealthModule } from "./health/health.module";
import { LogStorageModule } from "./logs/log-storage.module";
import { LogsModule } from "./logs/logs.module";
import { MaintenanceModule } from "./maintenance/maintenance.module";
import { OvhModule } from "./ovh/ovh.module";
import { ReconcileModule } from "./reconcile/reconcile.module";
import { RedisModule } from "./redis/redis.module";
import { StatsModule } from "./stats/stats.module";
import { SystemModule } from "./system/system.module";
import { TasksModule } from "./tasks/tasks.module";
import { TraefikModule } from "./traefik/traefik.module";
import { UsersModule } from "./users/users.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    // Baseline rate limit; auth endpoints tighten it further (see AuthController).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DbModule,
    RedisModule,
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
    FilesModule,
    MaintenanceModule,
    AdminModule,
    StatsModule,
    TasksModule,
    AuditModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
