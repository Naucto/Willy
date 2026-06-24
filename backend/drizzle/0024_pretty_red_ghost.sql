ALTER TYPE "public"."audit_action" ADD VALUE 'USER_DISABLE';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'USER_ENABLE';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled" boolean DEFAULT false NOT NULL;