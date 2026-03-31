ALTER TABLE `libraries` ADD `watch_enabled` integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `libraries` ADD `last_scan_result` text;--> statement-breakpoint
ALTER TABLE `libraries` ADD `last_scan_duration` integer;
