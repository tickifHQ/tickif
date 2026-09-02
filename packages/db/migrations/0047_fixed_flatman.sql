ALTER TYPE "public"."moderation_action" ADD VALUE 'archive';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'restore';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'delete';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'delisted';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'deleted';