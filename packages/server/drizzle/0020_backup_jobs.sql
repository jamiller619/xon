CREATE TABLE `backup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL REFERENCES `backup_targets`(`id`) ON DELETE CASCADE,
	`scope` text NOT NULL DEFAULT '{}',
	`status` text NOT NULL DEFAULT 'pending',
	`total_files` integer NOT NULL DEFAULT 0,
	`copied_files` integer NOT NULL DEFAULT 0,
	`errors` text NOT NULL DEFAULT '[]',
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL DEFAULT (unixepoch())
);
