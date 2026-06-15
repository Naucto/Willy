ALTER TYPE "public"."build_strategy" ADD VALUE 'IMAGE';--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "image_ref" text;