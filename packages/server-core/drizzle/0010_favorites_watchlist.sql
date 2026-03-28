CREATE TABLE `favorites` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`media_item_id` text NOT NULL REFERENCES `media_items`(`id`) ON DELETE cascade,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	PRIMARY KEY(`user_id`, `media_item_id`)
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`media_item_id` text NOT NULL REFERENCES `media_items`(`id`) ON DELETE cascade,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	PRIMARY KEY(`user_id`, `media_item_id`)
);
