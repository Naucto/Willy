ALTER TYPE "public"."audit_action" ADD VALUE 'DEPLOYMENT_DELETE';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'USER_ROLE_CHANGE';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'USER_PASSWORD_RESET';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'USER_DELETE';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'WEBHOOK_ROTATE';