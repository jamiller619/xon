ALTER TABLE `server_settings` ADD `server_port` integer DEFAULT 32400 NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `data_directory` text DEFAULT './data' NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `default_scan_schedule` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `thumbnail_sizes` text DEFAULT '["small","medium"]' NOT NULL;
