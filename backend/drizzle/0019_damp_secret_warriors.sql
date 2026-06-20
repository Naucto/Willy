ALTER TYPE "public"."audit_action" ADD VALUE 'TWOFA_REQUIRE';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'TWOFA_ENABLE';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'TWOFA_DISABLE';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_secret" text;