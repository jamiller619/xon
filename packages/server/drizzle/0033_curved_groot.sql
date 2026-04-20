PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_matching_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`media_item_id` text NOT NULL,
	`suggested_title` text NOT NULL,
	`suggested_metadata` text DEFAULT '{}' NOT NULL,
	`confidence` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`match_source` text DEFAULT 'cloud' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_matching_queue`("id", "media_item_id", "suggested_title", "suggested_metadata", "confidence", "status", "match_source", "created_at", "updated_at") SELECT "id", "media_item_id", "suggested_title", "suggested_metadata", "confidence", "status", "match_source", "created_at", "updated_at" FROM `matching_queue`;--> statement-breakpoint
DROP TABLE `matching_queue`;--> statement-breakpoint
ALTER TABLE `__new_matching_queue` RENAME TO `matching_queue`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `matching_queue_media_item_id_idx` ON `matching_queue` (`media_item_id`);--> statement-breakpoint
CREATE INDEX `matching_queue_status_idx` ON `matching_queue` (`status`);