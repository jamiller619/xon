CREATE TABLE `sync_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`scope` text NOT NULL DEFAULT '{}',
	`target_path` text NOT NULL,
	`include_media` integer NOT NULL DEFAULT false,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL REFERENCES `sync_profiles`(`id`) ON DELETE CASCADE,
	`status` text NOT NULL DEFAULT 'pending',
	`total_items` integer NOT NULL DEFAULT 0,
	`synced_items` integer NOT NULL DEFAULT 0,
	`errors` text NOT NULL DEFAULT '[]',
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
