PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_media_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`library_id` text NOT NULL,
	`data_source_id` text,
	`match_id` text,
	`match_id_source` text,
	`file_path` text NOT NULL,
	`file_size` integer NOT NULL,
	`file_metadata` text NOT NULL,
	`media_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`drm_protected` integer DEFAULT false NOT NULL,
	`scanned_at` integer NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_media_items`("id", "created_at", "updated_at", "library_id", "data_source_id", "match_id", "match_id_source", "file_path", "file_size", "file_metadata", "media_type", "title", "description", "metadata", "drm_protected", "scanned_at", "tags") SELECT "id", "created_at", "updated_at", "library_id", "data_source_id", "match_id", "match_id_source", "file_path", "file_size", "file_metadata", "media_type", "title", "description", "metadata", "drm_protected", "scanned_at", "tags" FROM `media_items`;--> statement-breakpoint
DROP TABLE `media_items`;--> statement-breakpoint
ALTER TABLE `__new_media_items` RENAME TO `media_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `media_items_media_type_idx` ON `media_items` (`media_type`);--> statement-breakpoint
CREATE INDEX `media_items_file_path_idx` ON `media_items` (`file_path`);--> statement-breakpoint
CREATE INDEX `media_items_data_source_path_idx` ON `media_items` (`data_source_id`,`file_path`);--> statement-breakpoint
CREATE INDEX `media_items_title_idx` ON `media_items` (`title`);--> statement-breakpoint
CREATE INDEX `media_items_library_id_idx` ON `media_items` (`library_id`);--> statement-breakpoint
CREATE INDEX `media_items_created_at_idx` ON `media_items` (`created_at`);--> statement-breakpoint
CREATE TRIGGER `media_items_fts_insert`
AFTER INSERT ON `media_items`
BEGIN
	INSERT INTO `media_fts` (`id`, `title`, `description`, `file_path`, `tags`, `metadata_text`)
	VALUES (
		new.`id`,
		new.`title`,
		coalesce(new.`description`, ''),
		new.`file_path`,
		coalesce(new.`tags`, '[]'),
		coalesce((
			SELECT group_concat(cast(`metadata_value`.`atom` AS text), ' ')
			FROM json_tree(
				CASE
					WHEN json_valid(new.`metadata`) THEN new.`metadata`
					ELSE '{}'
				END
			) AS `metadata_value`
			WHERE `metadata_value`.`type` IN ('text', 'integer', 'real')
				AND `metadata_value`.`fullkey` NOT LIKE '$.images.%'
				AND `metadata_value`.`fullkey` NOT LIKE '$.images[%'
				AND NOT (
					`metadata_value`.`type` = 'text'
					AND (
						lower(cast(`metadata_value`.`atom` AS text)) LIKE 'http://%'
						OR lower(cast(`metadata_value`.`atom` AS text)) LIKE 'https://%'
						OR lower(cast(`metadata_value`.`atom` AS text)) LIKE 'data:%'
					)
				)
		), '')
	);
END;--> statement-breakpoint
CREATE TRIGGER `media_items_fts_update`
AFTER UPDATE OF `id`, `title`, `description`, `file_path`, `tags`, `metadata` ON `media_items`
BEGIN
	DELETE FROM `media_fts` WHERE `id` = old.`id`;
	INSERT INTO `media_fts` (`id`, `title`, `description`, `file_path`, `tags`, `metadata_text`)
	VALUES (
		new.`id`,
		new.`title`,
		coalesce(new.`description`, ''),
		new.`file_path`,
		coalesce(new.`tags`, '[]'),
		coalesce((
			SELECT group_concat(cast(`metadata_value`.`atom` AS text), ' ')
			FROM json_tree(
				CASE
					WHEN json_valid(new.`metadata`) THEN new.`metadata`
					ELSE '{}'
				END
			) AS `metadata_value`
			WHERE `metadata_value`.`type` IN ('text', 'integer', 'real')
				AND `metadata_value`.`fullkey` NOT LIKE '$.images.%'
				AND `metadata_value`.`fullkey` NOT LIKE '$.images[%'
				AND NOT (
					`metadata_value`.`type` = 'text'
					AND (
						lower(cast(`metadata_value`.`atom` AS text)) LIKE 'http://%'
						OR lower(cast(`metadata_value`.`atom` AS text)) LIKE 'https://%'
						OR lower(cast(`metadata_value`.`atom` AS text)) LIKE 'data:%'
					)
				)
		), '')
	);
END;--> statement-breakpoint
CREATE TRIGGER `media_items_fts_delete`
AFTER DELETE ON `media_items`
BEGIN
	DELETE FROM `media_fts` WHERE `id` = old.`id`;
END;
