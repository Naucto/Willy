import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ServiceResources } from "../../deployments/resource-limits";
import type { StrategyConfig } from "../../deployments/strategy-config";
import {
  auditActionEnum,
  backupDestinationTypeEnum,
  backupKindEnum,
  backupStatusEnum,
  cronRunStatusEnum,
  buildStrategyEnum,
  certStatusEnum,
  databaseEngineEnum,
  deploymentStateEnum,
  deploymentTypeEnum,
  dnsRecordTypeEnum,
  domainTypeEnum,
  envScopeEnum,
  gitCredentialKindEnum,
  releaseStatusEnum,
  restartPolicyEnum,
  roleEnum,
} from "./enums";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("VIEWER"),
  refreshTokenHash: text("refresh_token_hash"),
  createdAt,
  updatedAt,
});

export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  type: deploymentTypeEnum("type").notNull().default("WEB"),
  gitUrl: text("git_url").notNull(),
  gitRef: text("git_ref").notNull().default("main"),
  buildStrategy: buildStrategyEnum("build_strategy").notNull().default("NIXPACKS"),
  // Per-strategy settings (dockerfile path / compose file+service / image ref), shaped by
  // build_strategy. See deployments/strategy-config.ts.
  strategyConfig: jsonb("strategy_config").$type<StrategyConfig>().notNull().default({}),
  runCommand: text("run_command"),
  cronExpr: text("cron_expr"),
  webServicePort: integer("web_service_port"),
  healthCheckPath: text("health_check_path").notNull().default("/"),
  autoDeploy: boolean("auto_deploy").notNull().default(false),
  restartPolicy: restartPolicyEnum("restart_policy").notNull().default("UNLESS_STOPPED"),
  memoryLimitMb: integer("memory_limit_mb"),
  nanoCpus: bigint("nano_cpus", { mode: "number" }),
  // Linux capabilities to add/drop relative to Docker's default set (single-container deployments).
  capAdd: jsonb("cap_add").$type<string[]>(),
  capDrop: jsonb("cap_drop").$type<string[]>(),
  // Per-container log rotation for single-container deployments (json-file driver).
  logMaxSizeMb: integer("log_max_size_mb"),
  logMaxFiles: integer("log_max_files"),
  // Per-service resource limits for compose deployments, keyed by compose service name.
  serviceResources: jsonb("service_resources").$type<ServiceResources>().notNull().default({}),
  state: deploymentStateEnum("state").notNull().default("CREATED"),
  // Logical FK to releases.id (kept constraint-free to avoid a circular FK with releases).
  activeReleaseId: uuid("active_release_id"),
  gitCredentialId: uuid("git_credential_id"),
  createdAt,
  updatedAt,
});

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    gitSha: text("git_sha"),
    imageTag: text("image_tag"),
    status: releaseStatusEnum("status").notNull().default("QUEUED"),
    containerId: text("container_id"),
    composeProject: text("compose_project"),
    logPath: text("log_path"),
    errorMessage: text("error_message"),
    createdById: uuid("created_by_id"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("releases_deployment_created_idx").on(t.deploymentId, t.createdAt)],
);

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fqdn: text("fqdn").notNull().unique(),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    type: domainTypeEnum("type").notNull().default("SUBDOMAIN"),
    certStatus: certStatusEnum("cert_status").notNull().default("NONE"),
    certResolver: text("cert_resolver").notNull().default("ovh"),
    isPrimary: boolean("is_primary").notNull().default(false),
    // Granular routing: a domain points at a specific container/service (compose service name;
    // null = the deployment's single/default container) and an internal port (null = the
    // deployment's webServicePort). Lets one stack route many domains to different services/ports.
    targetService: text("target_service"),
    targetPort: integer("target_port"),
    createdAt,
    updatedAt,
  },
  (t) => [index("domains_deployment_idx").on(t.deploymentId)],
);

export const dnsRecords = pgTable(
  "dns_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    zone: text("zone").notNull(),
    subDomain: text("sub_domain").notNull().default(""),
    type: dnsRecordTypeEnum("type").notNull(),
    target: text("target").notNull(),
    ttl: integer("ttl").notNull().default(3600),
    ovhRecordId: bigint("ovh_record_id", { mode: "number" }),
    managedByWilly: boolean("managed_by_willy").notNull().default(true),
    deploymentId: uuid("deployment_id").references(() => deployments.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("dns_records_zone_sub_type_idx").on(t.zone, t.subDomain, t.type)],
);

export const envVars = pgTable(
  "env_vars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    cipherText: text("cipher_text").notNull(),
    nonce: text("nonce").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    scope: envScopeEnum("scope").notNull().default("RUNTIME"),
    isSecret: boolean("is_secret").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("env_vars_deployment_key_idx").on(t.deploymentId, t.key)],
);

export const webhookSecrets = pgTable("webhook_secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  deploymentId: uuid("deployment_id")
    .notNull()
    .unique()
    .references(() => deployments.id, { onDelete: "cascade" }),
  secretCipher: text("secret_cipher").notNull(),
  nonce: text("nonce").notNull(),
  authTag: text("auth_tag").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  provider: text("provider").notNull().default("github"),
  lastDeliveryId: text("last_delivery_id"),
  createdAt,
});

export const gitCredentials = pgTable("git_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: gitCredentialKindEnum("kind").notNull().default("PUBLIC"),
  cipherText: text("cipher_text"),
  nonce: text("nonce"),
  authTag: text("auth_tag"),
  keyVersion: integer("key_version").notNull().default(1),
  deploymentId: uuid("deployment_id").references(() => deployments.id, { onDelete: "cascade" }),
  createdAt,
  updatedAt,
});

export const databases = pgTable("databases", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  engine: databaseEngineEnum("engine").notNull(),
  version: text("version").notNull(),
  containerId: text("container_id"),
  volumeName: text("volume_name").notNull(),
  networkName: text("network_name").notNull(),
  credCipher: text("cred_cipher"),
  credNonce: text("cred_nonce"),
  credAuthTag: text("cred_auth_tag"),
  connStringEnvKey: text("conn_string_env_key"),
  state: text("state").notNull().default("CREATED"),
  memoryLimitMb: integer("memory_limit_mb"),
  createdAt,
  updatedAt,
});

export const databaseAttachments = pgTable(
  "database_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    databaseId: uuid("database_id")
      .notNull()
      .references(() => databases.id, { onDelete: "cascade" }),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    injectPrefix: text("inject_prefix"),
    createdAt,
  },
  (t) => [uniqueIndex("database_attachments_db_deployment_idx").on(t.databaseId, t.deploymentId)],
);

export const backups = pgTable(
  "backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deploymentId: uuid("deployment_id").references(() => deployments.id, { onDelete: "set null" }),
    kind: backupKindEnum("kind").notNull(),
    status: backupStatusEnum("status").notNull().default("PENDING"),
    target: text("target"),
    location: text("location"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    checksum: text("checksum"),
    offsiteUrl: text("offsite_url"),
    scheduleId: uuid("schedule_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt,
  },
  (t) => [index("backups_deployment_created_idx").on(t.deploymentId, t.createdAt)],
);

export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    status: cronRunStatusEnum("status").notNull().default("RUNNING"),
    exitCode: integer("exit_code"),
    logs: text("logs"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("cron_runs_deployment_started_idx").on(t.deploymentId, t.startedAt)],
);

export const backupDestinations = pgTable("backup_destinations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  type: backupDestinationTypeEnum("type").notNull(),
  // The connection config (bucket/host/credentials) as an AES-256-GCM sealed JSON blob.
  cipherText: text("cipher_text").notNull(),
  nonce: text("nonce").notNull(),
  authTag: text("auth_tag").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  createdAt,
});

export const backupSchedules = pgTable("backup_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  deploymentId: uuid("deployment_id").references(() => deployments.id, { onDelete: "cascade" }),
  kind: backupKindEnum("kind").notNull(),
  target: text("target").notNull(),
  cron: text("cron").notNull(),
  retention: integer("retention").notNull().default(7),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt,
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    action: auditActionEnum("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt,
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_actor_idx").on(t.actorId),
  ],
);
