CREATE TABLE `media_play_states` (
	`user_id` text NOT NULL,
	`media_item_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`duration` integer,
	`status` text DEFAULT 'playing' NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`stopped_at` integer,
	PRIMARY KEY(`user_id`, `media_item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_play_states_user_updated_idx` ON `media_play_states` (`user_id`,`updated_at`);