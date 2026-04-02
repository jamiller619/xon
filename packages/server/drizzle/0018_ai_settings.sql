CREATE TABLE `ai_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`ai_enabled` integer NOT NULL DEFAULT 1,
	`ai_mode` text NOT NULL DEFAULT 'local-only',
	`cloud_api_key` text,
	`cloud_api_url` text,
	`feature_matching` integer NOT NULL DEFAULT 1,
	`feature_tagging` integer NOT NULL DEFAULT 1,
	`feature_similarity` integer NOT NULL DEFAULT 1,
	`feature_smart_grouping` integer NOT NULL DEFAULT 1,
	`updated_at` integer NOT NULL DEFAULT (unixepoch())
);
-->statement-breakpoint
INSERT OR IGNORE INTO `ai_settings` (`id`) VALUES ('default');
