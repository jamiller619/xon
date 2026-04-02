CREATE TABLE `media_items` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`data_source_id` text NOT NULL,
	`file_path` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`mime_type` text,
	`media_category` text,
	`title` text,
	`description` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`drm_protected` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`scanned_at` integer,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_items_library_id_idx` ON `media_items` (`library_id`);--> statement-breakpoint
CREATE INDEX `media_items_media_category_idx` ON `media_items` (`media_category`);--> statement-breakpoint
CREATE INDEX `media_items_file_path_idx` ON `media_items` (`file_path`);