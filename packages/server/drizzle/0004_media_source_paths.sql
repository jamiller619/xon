ALTER TABLE `media_items` ADD `data_source_id` text;
--> statement-breakpoint
CREATE INDEX `media_items_data_source_path_idx` ON `media_items` (`data_source_id`,`file_path`);
