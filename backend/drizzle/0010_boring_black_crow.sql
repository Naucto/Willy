DROP INDEX "env_vars_deployment_key_idx";--> statement-breakpoint
ALTER TABLE "env_vars" ADD COLUMN "target_service" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "env_vars_deployment_service_key_idx" ON "env_vars" USING btree ("deployment_id","target_service","key");