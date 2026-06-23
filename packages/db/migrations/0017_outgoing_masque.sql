-- Safe ADD VALUE: this migration appends the enum value and does not use it
-- in a default, check, cast, or data rewrite inside the same transaction.
ALTER TYPE "public"."project_status" ADD VALUE 'changes_requested';
