CREATE TABLE `ai_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`ai_enabled` integer DEFAULT true NOT NULL,
	`ai_mode` text DEFAULT 'local-only' NOT NULL,
	`cloud_api_key` text,
	`cloud_api_url` text,
	`feature_matching` integer DEFAULT true NOT NULL,
	`feature_tagging` integer DEFAULT true NOT NULL,
	`feature_similarity` integer DEFAULT true NOT NULL,
	`feature_smart_grouping` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_file_state` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`file_path` text NOT NULL,
	`file_size` integer DEFAULT 0 NOT NULL,
	`mtime` integer DEFAULT 0 NOT NULL,
	`checksum` text,
	`backed_up_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `backup_targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_file_state_target_path_idx` ON `backup_file_state` (`target_id`,`file_path`);--> statement-breakpoint
CREATE TABLE `backup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`scope` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_files` integer DEFAULT 0 NOT NULL,
	`copied_files` integer DEFAULT 0 NOT NULL,
	`skipped_files` integer DEFAULT 0 NOT NULL,
	`errors` text DEFAULT '[]' NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `backup_targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `backup_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'local' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`remove_deleted` integer DEFAULT false NOT NULL,
	`schedule` text,
	`retention_keep_count` integer,
	`retention_keep_days` integer,
	`next_scheduled_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_verify_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_files` integer DEFAULT 0 NOT NULL,
	`passed_files` integer DEFAULT 0 NOT NULL,
	`failed_files` integer DEFAULT 0 NOT NULL,
	`missing_files` integer DEFAULT 0 NOT NULL,
	`failed_items` text DEFAULT '[]' NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `backup_targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `duplicate_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`media_item_id_1` text NOT NULL,
	`media_item_id_2` text NOT NULL,
	`similarity` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_item_id_1`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_item_id_2`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `duplicate_candidates_library_id_idx` ON `duplicate_candidates` (`library_id`);--> statement-breakpoint
CREATE INDEX `duplicate_candidates_status_idx` ON `duplicate_candidates` (`status`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`media_item_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`group_id`, `media_item_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`parent_group_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `groups_library_id_idx` ON `groups` (`library_id`);--> statement-breakpoint
CREATE INDEX `groups_parent_group_id_idx` ON `groups` (`parent_group_id`);--> statement-breakpoint
CREATE TABLE `image_hashes` (
	`id` text PRIMARY KEY NOT NULL,
	`media_item_id` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_hashes_media_item_id_unique` ON `image_hashes` (`media_item_id`);--> statement-breakpoint
CREATE INDEX `image_hashes_media_item_id_idx` ON `image_hashes` (`media_item_id`);--> statement-breakpoint
CREATE TABLE `matching_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`media_item_id` text NOT NULL,
	`suggested_title` text NOT NULL,
	`suggested_metadata` text DEFAULT '{}' NOT NULL,
	`confidence` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`match_source` text DEFAULT 'local' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `matching_queue_media_item_id_idx` ON `matching_queue` (`media_item_id`);--> statement-breakpoint
CREATE INDEX `matching_queue_status_idx` ON `matching_queue` (`status`);--> statement-breakpoint
CREATE TABLE `server_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`cors_enabled` integer DEFAULT false NOT NULL,
	`cors_allowed_origins` text DEFAULT '["*"]' NOT NULL,
	`rate_limit_enabled` integer DEFAULT true NOT NULL,
	`rate_limit_general` integer DEFAULT 100 NOT NULL,
	`rate_limit_auth` integer DEFAULT 10 NOT NULL,
	`https_enabled` integer DEFAULT false NOT NULL,
	`https_cert_path` text,
	`https_key_path` text,
	`acme_enabled` integer DEFAULT false NOT NULL,
	`acme_domain` text,
	`acme_email` text,
	`acme_certs_dir` text,
	`trust_proxy` integer DEFAULT false NOT NULL,
	`server_port` integer DEFAULT 32400 NOT NULL,
	`data_directory` text DEFAULT './data' NOT NULL,
	`default_scan_schedule` text,
	`thumbnail_sizes` text DEFAULT '["small","medium"]' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suggested_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`suggested_title` text NOT NULL,
	`suggested_type` text NOT NULL,
	`reason` text NOT NULL,
	`member_item_ids` text DEFAULT '[]' NOT NULL,
	`confidence` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `suggested_groups_library_id_idx` ON `suggested_groups` (`library_id`);--> statement-breakpoint
CREATE INDEX `suggested_groups_status_idx` ON `suggested_groups` (`status`);--> statement-breakpoint
CREATE TABLE `sync_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'full' NOT NULL,
	`scope` text DEFAULT '{}' NOT NULL,
	`target_path` text NOT NULL,
	`include_media` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_items` integer DEFAULT 0 NOT NULL,
	`synced_items` integer DEFAULT 0 NOT NULL,
	`errors` text DEFAULT '[]' NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `sync_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `data_sources` ADD `plugin_id` text;--> statement-breakpoint
ALTER TABLE `libraries` ADD `watch_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `libraries` ADD `last_scan_result` text;--> statement-breakpoint
ALTER TABLE `libraries` ADD `last_scan_duration` integer;--> statement-breakpoint
ALTER TABLE `libraries` ADD `hide_drm_items` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `hide_drm_items` integer DEFAULT false NOT NULL;