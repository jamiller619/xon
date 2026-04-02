ALTER TABLE `media_items` ADD `content_rating` text;--> statement-breakpoint
ALTER TABLE `users` ADD `max_content_rating` text DEFAULT 'none' NOT NULL;