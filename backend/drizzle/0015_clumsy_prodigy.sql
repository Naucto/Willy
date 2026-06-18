CREATE TYPE "public"."task_kind" AS ENUM('DEPLOY', 'BACKUP', 'RESTORE', 'OFFSITE_PUSH', 'VOLUME_RESET', 'PRUNE_IMAGES', 'PRUNE_CONTAINERS');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PRUNE_IMAGES';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PRUNE_CONTAINERS';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'VOLUME_RESET';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'OFFSITE_PUSH';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'SETTINGS_CHANGE';--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "task_kind" NOT NULL,
	"status" "task_status" DEFAULT 'PENDING' NOT NULL,
	"title" text NOT NULL,
	"deployment_id" uuid,
	"actor_id" uuid,
	"progress" integer,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_created_idx" ON "tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");