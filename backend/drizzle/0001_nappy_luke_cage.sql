CREATE TYPE "public"."backup_destination_type" AS ENUM('S3', 'FTP', 'SFTP');--> statement-breakpoint
CREATE TABLE "backup_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "backup_destination_type" NOT NULL,
	"cipher_text" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backup_destinations_name_unique" UNIQUE("name")
);
