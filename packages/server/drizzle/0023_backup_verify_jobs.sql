CREATE TABLE IF NOT EXISTS `backup_verify_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL REFERENCES backup_targets(id) ON DELETE CASCADE,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_files` integer DEFAULT 0 NOT NULL,
	`passed_files` integer DEFAULT 0 NOT NULL,
	`failed_files` integer DEFAULT 0 NOT NULL,
	`missing_files` integer DEFAULT 0 NOT NULL,
	`failed_items` text DEFAULT '[]' NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
