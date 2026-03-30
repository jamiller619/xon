CREATE TABLE `backup_file_state` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL REFERENCES `backup_targets`(`id`) ON DELETE CASCADE,
	`file_path` text NOT NULL,
	`file_size` integer NOT NULL DEFAULT 0,
	`mtime` integer NOT NULL DEFAULT 0,
	`checksum` text,
	`backed_up_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_file_state_target_path_idx` ON `backup_file_state` (`target_id`,`file_path`);
--> statement-breakpoint
ALTER TABLE `backup_targets` ADD COLUMN `remove_deleted` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `backup_jobs` ADD COLUMN `skipped_files` integer NOT NULL DEFAULT 0;
