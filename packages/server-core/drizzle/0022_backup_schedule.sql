-- US-091: Scheduled backups with retention policies
-- Add schedule and retention fields to backup_targets
ALTER TABLE `backup_targets` ADD COLUMN `schedule` text;
--> statement-breakpoint
ALTER TABLE `backup_targets` ADD COLUMN `retention_keep_count` integer;
--> statement-breakpoint
ALTER TABLE `backup_targets` ADD COLUMN `retention_keep_days` integer;
--> statement-breakpoint
ALTER TABLE `backup_targets` ADD COLUMN `next_scheduled_at` integer;
