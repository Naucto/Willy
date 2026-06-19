import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["ADMIN", "OPERATOR", "VIEWER"]);
export const deploymentTypeEnum = pgEnum("deployment_type", ["WEB", "WORKER", "CRON"]);
export const buildStrategyEnum = pgEnum("build_strategy", ["DOCKERFILE", "COMPOSE", "IMAGE"]);
export const envScopeEnum = pgEnum("env_scope", ["BUILD", "RUNTIME", "BOTH"]);

export const releaseStatusEnum = pgEnum("release_status", [
  "QUEUED",
  "CLONING",
  "BUILDING",
  "HEALTHCHECKING",
  "LIVE",
  "SUPERSEDED",
  "FAILED",
  "ROLLEDBACK",
  "INTERRUPTED",
]);

export const deploymentStateEnum = pgEnum("deployment_state", [
  "CREATED",
  "DEPLOYING",
  "RUNNING",
  "DEGRADED",
  "STOPPED",
  "ERROR",
]);

export const domainTypeEnum = pgEnum("domain_type", ["SUBDOMAIN", "CUSTOM_EXTERNAL", "APEX"]);
export const certStatusEnum = pgEnum("cert_status", ["NONE", "PENDING", "ISSUED", "FAILED"]);
export const dnsRecordTypeEnum = pgEnum("dns_record_type", ["A", "AAAA", "CNAME", "TXT"]);

export const gitCredentialKindEnum = pgEnum("git_credential_kind", [
  "PUBLIC",
  "GITHUB_APP",
  "DEPLOY_KEY",
  "PAT",
]);

export const databaseEngineEnum = pgEnum("database_engine", [
  "POSTGRES",
  "MYSQL",
  "REDIS",
  "MONGO",
]);
export const backupKindEnum = pgEnum("backup_kind", ["VOLUME_TAR", "PG_DUMP", "S3_SYNC"]);
export const backupDestinationTypeEnum = pgEnum("backup_destination_type", [
  "S3",
  "FTP",
  "SFTP",
  "SSH",
]);
export const cronRunStatusEnum = pgEnum("cron_run_status", ["RUNNING", "SUCCESS", "FAILED"]);
export const backupStatusEnum = pgEnum("backup_status", [
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
]);

export const restartPolicyEnum = pgEnum("restart_policy", [
  "NO",
  "ON_FAILURE",
  "ALWAYS",
  "UNLESS_STOPPED",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "LOGIN",
  "DEPLOY",
  "REDEPLOY",
  "ROLLBACK",
  "STOP",
  "START",
  "ENV_CHANGE",
  "DNS_CHANGE",
  "DOMAIN_ADD",
  "DOMAIN_REMOVE",
  "BACKUP_CREATE",
  "RESTORE",
  "CONSOLE_OPEN",
  "WEBHOOK_TRIGGER",
  "USER_CREATE",
  // Appended (Postgres only allows ALTER TYPE ADD VALUE at the end).
  "PRUNE_IMAGES",
  "PRUNE_CONTAINERS",
  "VOLUME_RESET",
  "OFFSITE_PUSH",
  "SETTINGS_CHANGE",
  "DEPLOYMENT_DELETE",
  "USER_ROLE_CHANGE",
  "USER_PASSWORD_RESET",
  "USER_DELETE",
  "WEBHOOK_ROTATE",
]);

// Long-running administrative operations surfaced in the top-bar activity tracker.
export const taskKindEnum = pgEnum("task_kind", [
  "DEPLOY",
  "BACKUP",
  "RESTORE",
  "OFFSITE_PUSH",
  "VOLUME_RESET",
  "PRUNE_IMAGES",
  "PRUNE_CONTAINERS",
]);

export const taskStatusEnum = pgEnum("task_status", ["PENDING", "RUNNING", "SUCCESS", "FAILED"]);
