CREATE TABLE `reading_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`media_item_id` text NOT NULL,
	`cfi` text NOT NULL,
	`chapter_title` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_positions_media_item_id_unique` ON `reading_positions` (`media_item_id`);