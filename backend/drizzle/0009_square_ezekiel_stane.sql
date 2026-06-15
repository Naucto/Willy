ALTER TABLE "deployments" ADD COLUMN "log_max_size_mb" integer;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "log_max_files" integer;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "service_resources" jsonb DEFAULT '{}'::jsonb NOT NULL;