-- Create matching_queue table for AI-assisted fuzzy media matching review
CREATE TABLE `matching_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`media_item_id` text NOT NULL,
	`suggested_title` text NOT NULL,
	`suggested_metadata` text NOT NULL DEFAULT '{}',
	`confidence` integer NOT NULL,
	`status` text NOT NULL DEFAULT 'pending',
	`match_source` text NOT NULL DEFAULT 'local',
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	`updated_at` integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `matching_queue_media_item_id_idx` ON `matching_queue` (`media_item_id`);
--> statement-breakpoint
CREATE INDEX `matching_queue_status_idx` ON `matching_queue` (`status`);
