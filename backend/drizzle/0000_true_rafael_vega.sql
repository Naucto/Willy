CREATE TYPE "public"."audit_action" AS ENUM('LOGIN', 'DEPLOY', 'REDEPLOY', 'ROLLBACK', 'STOP', 'START', 'ENV_CHANGE', 'DNS_CHANGE', 'DOMAIN_ADD', 'DOMAIN_REMOVE', 'BACKUP_CREATE', 'RESTORE', 'CONSOLE_OPEN', 'WEBHOOK_TRIGGER', 'USER_CREATE');--> statement-breakpoint
CREATE TYPE "public"."backup_kind" AS ENUM('VOLUME_TAR', 'PG_DUMP', 'S3_SYNC');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."build_strategy" AS ENUM('NIXPACKS', 'DOCKERFILE', 'COMPOSE');--> statement-breakpoint
CREATE TYPE "public"."cert_status" AS ENUM('NONE', 'PENDING', 'ISSUED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."database_engine" AS ENUM('POSTGRES', 'MYSQL', 'REDIS', 'MONGO');--> statement-breakpoint
CREATE TYPE "public"."deployment_state" AS ENUM('CREATED', 'DEPLOYING', 'RUNNING', 'DEGRADED', 'STOPPED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."deployment_type" AS ENUM('WEB', 'WORKER', 'CRON');--> statement-breakpoint
CREATE TYPE "public"."dns_record_type" AS ENUM('A', 'AAAA', 'CNAME', 'TXT');--> statement-breakpoint
CREATE TYPE "public"."domain_type" AS ENUM('SUBDOMAIN', 'CUSTOM_EXTERNAL', 'APEX');--> statement-breakpoint
CREATE TYPE "public"."env_scope" AS ENUM('BUILD', 'RUNTIME', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."git_credential_kind" AS ENUM('PUBLIC', 'GITHUB_APP', 'DEPLOY_KEY', 'PAT');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('QUEUED', 'CLONING', 'BUILDING', 'HEALTHCHECKING', 'LIVE', 'SUPERSEDED', 'FAILED', 'ROLLEDBACK', 'INTERRUPTED');--> statement-breakpoint
CREATE TYPE "public"."restart_policy" AS ENUM('NO', 'ON_FAILURE', 'ALWAYS', 'UNLESS_STOPPED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'OPERATOR', 'VIEWER');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" "audit_action" NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid,
	"kind" "backup_kind" NOT NULL,
	"target" text NOT NULL,
	"cron" text NOT NULL,
	"retention" integer DEFAULT 7 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid,
	"kind" "backup_kind" NOT NULL,
	"status" "backup_status" DEFAULT 'PENDING' NOT NULL,
	"target" text,
	"location" text,
	"size_bytes" bigint,
	"checksum" text,
	"offsite_url" text,
	"schedule_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "database_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"deployment_id" uuid NOT NULL,
	"inject_prefix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"engine" "database_engine" NOT NULL,
	"version" text NOT NULL,
	"container_id" text,
	"volume_name" text NOT NULL,
	"network_name" text NOT NULL,
	"cred_cipher" text,
	"cred_nonce" text,
	"cred_auth_tag" text,
	"conn_string_env_key" text,
	"state" text DEFAULT 'CREATED' NOT NULL,
	"memory_limit_mb" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "databases_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "deployment_type" DEFAULT 'WEB' NOT NULL,
	"git_url" text NOT NULL,
	"git_ref" text DEFAULT 'main' NOT NULL,
	"build_strategy" "build_strategy" DEFAULT 'NIXPACKS' NOT NULL,
	"dockerfile_path" text,
	"compose_file_path" text,
	"compose_web_service" text,
	"run_command" text,
	"cron_expr" text,
	"web_service_port" integer,
	"health_check_path" text DEFAULT '/' NOT NULL,
	"auto_deploy" boolean DEFAULT false NOT NULL,
	"restart_policy" "restart_policy" DEFAULT 'UNLESS_STOPPED' NOT NULL,
	"memory_limit_mb" integer,
	"nano_cpus" bigint,
	"state" "deployment_state" DEFAULT 'CREATED' NOT NULL,
	"active_release_id" uuid,
	"git_credential_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "dns_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone" text NOT NULL,
	"sub_domain" text DEFAULT '' NOT NULL,
	"type" "dns_record_type" NOT NULL,
	"target" text NOT NULL,
	"ttl" integer DEFAULT 3600 NOT NULL,
	"ovh_record_id" bigint,
	"managed_by_willy" boolean DEFAULT true NOT NULL,
	"deployment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fqdn" text NOT NULL,
	"deployment_id" uuid NOT NULL,
	"type" "domain_type" DEFAULT 'SUBDOMAIN' NOT NULL,
	"cert_status" "cert_status" DEFAULT 'NONE' NOT NULL,
	"cert_resolver" text DEFAULT 'ovh' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_fqdn_unique" UNIQUE("fqdn")
);
--> statement-breakpoint
CREATE TABLE "env_vars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"key" text NOT NULL,
	"cipher_text" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"scope" "env_scope" DEFAULT 'RUNTIME' NOT NULL,
	"is_secret" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "git_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "git_credential_kind" DEFAULT 'PUBLIC' NOT NULL,
	"cipher_text" text,
	"nonce" text,
	"auth_tag" text,
	"key_version" integer DEFAULT 1 NOT NULL,
	"deployment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"git_sha" text,
	"image_tag" text,
	"status" "release_status" DEFAULT 'QUEUED' NOT NULL,
	"container_id" text,
	"compose_project" text,
	"log_path" text,
	"error_message" text,
	"created_by_id" uuid,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'VIEWER' NOT NULL,
	"refresh_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"secret_cipher" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"provider" text DEFAULT 'github' NOT NULL,
	"last_delivery_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_secrets_deployment_id_unique" UNIQUE("deployment_id")
);
--> statement-breakpoint
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_attachments" ADD CONSTRAINT "database_attachments_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_attachments" ADD CONSTRAINT "database_attachments_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_vars" ADD CONSTRAINT "env_vars_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_credentials" ADD CONSTRAINT "git_credentials_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_secrets" ADD CONSTRAINT "webhook_secrets_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "backups_deployment_created_idx" ON "backups" USING btree ("deployment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "database_attachments_db_deployment_idx" ON "database_attachments" USING btree ("database_id","deployment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dns_records_zone_sub_type_idx" ON "dns_records" USING btree ("zone","sub_domain","type");--> statement-breakpoint
CREATE INDEX "domains_deployment_idx" ON "domains" USING btree ("deployment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "env_vars_deployment_key_idx" ON "env_vars" USING btree ("deployment_id","key");--> statement-breakpoint
CREATE INDEX "releases_deployment_created_idx" ON "releases" USING btree ("deployment_id","created_at");