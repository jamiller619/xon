CREATE TABLE `media_progress` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`media_item_id` text NOT NULL REFERENCES `media_items`(`id`) ON DELETE cascade,
	`position` integer NOT NULL DEFAULT 0,
	`duration` integer NOT NULL DEFAULT 0,
	`completed` integer NOT NULL DEFAULT false,
	`updated_at` integer NOT NULL DEFAULT (unixepoch()),
	PRIMARY KEY(`user_id`, `media_item_id`)
);
