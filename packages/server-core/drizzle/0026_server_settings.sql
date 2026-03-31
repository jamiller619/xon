CREATE TABLE `server_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`cors_enabled` integer NOT NULL DEFAULT 0,
	`cors_allowed_origins` text NOT NULL DEFAULT '["*"]',
	`rate_limit_enabled` integer NOT NULL DEFAULT 1,
	`rate_limit_general` integer NOT NULL DEFAULT 100,
	`rate_limit_auth` integer NOT NULL DEFAULT 10,
	`updated_at` integer NOT NULL DEFAULT (unixepoch())
);
-->statement-breakpoint
INSERT OR IGNORE INTO `server_settings` (`id`) VALUES ('default');
