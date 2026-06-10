CREATE TYPE "public"."user_role" AS ENUM('visitor', 'designer', 'admin', 'superadmin');--> statement-breakpoint
UPDATE "user" SET "role" = 'visitor' WHERE "role" IS NULL OR "role" NOT IN ('visitor', 'designer', 'admin', 'superadmin');--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'visitor'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET NOT NULL;