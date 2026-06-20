ALTER TYPE "public"."audit_action" ADD VALUE 'USER_UPDATE';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;