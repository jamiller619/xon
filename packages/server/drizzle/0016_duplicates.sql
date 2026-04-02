CREATE TABLE `image_hashes` (
	`id` text PRIMARY KEY NOT NULL,
	`media_item_id` text NOT NULL UNIQUE,
	`hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
-->statement-breakpoint
CREATE INDEX `image_hashes_media_item_id_idx` ON `image_hashes` (`media_item_id`);
-->statement-breakpoint
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
-->statement-breakpoint
CREATE INDEX `duplicate_candidates_library_id_idx` ON `duplicate_candidates` (`library_id`);
-->statement-breakpoint
CREATE INDEX `duplicate_candidates_status_idx` ON `duplicate_candidates` (`status`);
