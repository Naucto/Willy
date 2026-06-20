CREATE TABLE "port_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"host_port" integer NOT NULL,
	"target_service" text,
	"target_port" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "port_bindings_host_port_unique" UNIQUE("host_port")
);
--> statement-breakpoint
ALTER TABLE "port_bindings" ADD CONSTRAINT "port_bindings_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "port_bindings_domain_idx" ON "port_bindings" USING btree ("domain_id");