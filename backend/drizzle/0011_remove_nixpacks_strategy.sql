ALTER TABLE "deployments" ALTER COLUMN "build_strategy" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "build_strategy" SET DEFAULT 'DOCKERFILE'::text;--> statement-breakpoint
-- Nixpacks was dropped: re-home any lingering rows onto the Dockerfile strategy before the enum
-- is recreated without the NIXPACKS value (the type cast below would otherwise reject them).
UPDATE "deployments" SET "build_strategy" = 'DOCKERFILE' WHERE "build_strategy" = 'NIXPACKS';--> statement-breakpoint
DROP TYPE "public"."build_strategy";--> statement-breakpoint
CREATE TYPE "public"."build_strategy" AS ENUM('DOCKERFILE', 'COMPOSE', 'IMAGE');--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "build_strategy" SET DEFAULT 'DOCKERFILE'::"public"."build_strategy";--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "build_strategy" SET DATA TYPE "public"."build_strategy" USING "build_strategy"::"public"."build_strategy";