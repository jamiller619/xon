PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TRIGGER IF EXISTS `media_items_fts_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `media_items_fts_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `media_items_fts_delete`;--> statement-breakpoint
DROP TABLE IF EXISTS `media_fts`;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`is_anonymous` integer DEFAULT false
);--> statement-breakpoint
INSERT INTO `__new_users` (
	`id`, `public_id`, `name`, `email`, `email_verified`, `image`, `created_at`, `updated_at`, `is_anonymous`
)
SELECT
	row_number() OVER (ORDER BY `users`.`rowid`),
	`id`, `name`, `email`, `email_verified`, `image`, `created_at`, `updated_at`, `is_anonymous`
FROM `users`;--> statement-breakpoint
CREATE TABLE `__new_libraries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`owner_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`content_type` text NOT NULL,
	`scan_schedule` text,
	`data_sources` text NOT NULL,
	`images` text DEFAULT '{"poster":[]}' NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_libraries` (
	`id`, `public_id`, `created_at`, `updated_at`, `owner_id`, `name`, `description`, `content_type`, `scan_schedule`, `data_sources`, `images`
)
SELECT
	row_number() OVER (ORDER BY `libraries`.`rowid`),
	`libraries`.`id`, `libraries`.`created_at`, `libraries`.`updated_at`,
	(SELECT `__new_users`.`id` FROM `__new_users` WHERE `__new_users`.`public_id` = `libraries`.`owner_id`),
	`libraries`.`name`, `libraries`.`description`, `libraries`.`content_type`, `libraries`.`scan_schedule`, `libraries`.`data_sources`, `libraries`.`images`
FROM `libraries`;--> statement-breakpoint
CREATE TABLE `__new_collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`parent_collection_id` integer,
	`metadata` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_collections` (
	`id`, `public_id`, `created_at`, `updated_at`, `user_id`, `type`, `title`, `metadata`
)
SELECT
	row_number() OVER (ORDER BY `collections`.`rowid`),
	`collections`.`id`, `collections`.`created_at`, `collections`.`updated_at`,
	(SELECT `__new_users`.`id` FROM `__new_users` WHERE `__new_users`.`public_id` = `collections`.`user_id`),
	`collections`.`type`, `collections`.`title`, `collections`.`metadata`
FROM `collections`;--> statement-breakpoint
UPDATE `__new_collections`
SET `parent_collection_id` = (
	SELECT `parent`.`id`
	FROM `collections` AS `old_collection`
	JOIN `__new_collections` AS `parent` ON `parent`.`public_id` = `old_collection`.`parent_collection_id`
	WHERE `old_collection`.`id` = `__new_collections`.`public_id`
)
WHERE EXISTS (
	SELECT 1 FROM `collections`
	WHERE `collections`.`id` = `__new_collections`.`public_id`
		AND `collections`.`parent_collection_id` IS NOT NULL
);--> statement-breakpoint
CREATE TABLE `__new_media_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`library_id` integer NOT NULL,
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
);--> statement-breakpoint
INSERT INTO `__new_media_items` (
	`id`, `public_id`, `created_at`, `updated_at`, `library_id`, `data_source_id`, `match_id`, `match_id_source`, `file_path`, `file_size`, `file_metadata`, `media_type`, `title`, `description`, `metadata`, `drm_protected`, `scanned_at`, `tags`
)
SELECT
	row_number() OVER (ORDER BY `media_items`.`rowid`),
	`media_items`.`id`, `media_items`.`created_at`, `media_items`.`updated_at`,
	(SELECT `__new_libraries`.`id` FROM `__new_libraries` WHERE `__new_libraries`.`public_id` = `media_items`.`library_id`),
	`media_items`.`data_source_id`, `media_items`.`match_id`, `media_items`.`match_id_source`,
	`media_items`.`file_path`, `media_items`.`file_size`, `media_items`.`file_metadata`,
	`media_items`.`media_type`, `media_items`.`title`, `media_items`.`description`,
	`media_items`.`metadata`, `media_items`.`drm_protected`, `media_items`.`scanned_at`, `media_items`.`tags`
FROM `media_items`;--> statement-breakpoint
CREATE TABLE `__new_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`avatar_url` text,
	`metadata` text DEFAULT '{}' NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_people` (`id`, `public_id`, `name`, `description`, `avatar_url`, `metadata`)
SELECT row_number() OVER (ORDER BY `people`.`rowid`), `id`, `name`, `description`, `avatar_url`, `metadata`
FROM `people`;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`last_seen_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`client_name` text,
	`ip_address` text,
	`user_agent` text,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_sessions` (
	`id`, `public_id`, `expires_at`, `token`, `created_at`, `updated_at`, `last_seen_at`, `client_name`, `ip_address`, `user_agent`, `user_id`
)
SELECT
	row_number() OVER (ORDER BY `sessions`.`rowid`),
	`sessions`.`id`, `sessions`.`expires_at`, `sessions`.`token`, `sessions`.`created_at`,
	`sessions`.`updated_at`, `sessions`.`last_seen_at`, `sessions`.`client_name`,
	`sessions`.`ip_address`, `sessions`.`user_agent`,
	(SELECT `__new_users`.`id` FROM `__new_users` WHERE `__new_users`.`public_id` = `sessions`.`user_id`)
FROM `sessions`;--> statement-breakpoint
CREATE TABLE `__new_people_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`person_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`role` text NOT NULL,
	`order` integer,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_people_media` (`id`, `public_id`, `person_id`, `media_id`, `role`, `order`)
SELECT
	row_number() OVER (ORDER BY `people_media`.`rowid`), `people_media`.`id`,
	(SELECT `__new_people`.`id` FROM `__new_people` WHERE `__new_people`.`public_id` = `people_media`.`person_id`),
	(SELECT `__new_media_items`.`id` FROM `__new_media_items` WHERE `__new_media_items`.`public_id` = `people_media`.`media_id`),
	`people_media`.`role`, `people_media`.`order`
FROM `people_media`;--> statement-breakpoint
CREATE TABLE `__new_collection_items` (
	`collection_id` integer NOT NULL,
	`media_item_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`collection_id`, `media_item_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_collection_items` (`collection_id`, `media_item_id`, `sort_order`)
SELECT
	(SELECT `__new_collections`.`id` FROM `__new_collections` WHERE `__new_collections`.`public_id` = `collection_items`.`collection_id`),
	(SELECT `__new_media_items`.`id` FROM `__new_media_items` WHERE `__new_media_items`.`public_id` = `collection_items`.`media_item_id`),
	`collection_items`.`sort_order`
FROM `collection_items`;--> statement-breakpoint
CREATE TABLE `__new_media_play_states` (
	`user_id` integer NOT NULL,
	`media_item_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`duration` integer,
	`status` text DEFAULT 'playing' NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`stopped_at` integer,
	PRIMARY KEY(`user_id`, `media_item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_media_play_states` (
	`user_id`, `media_item_id`, `position`, `duration`, `status`, `started_at`, `updated_at`, `stopped_at`
)
SELECT
	(SELECT `__new_users`.`id` FROM `__new_users` WHERE `__new_users`.`public_id` = `media_play_states`.`user_id`),
	(SELECT `__new_media_items`.`id` FROM `__new_media_items` WHERE `__new_media_items`.`public_id` = `media_play_states`.`media_item_id`),
	`position`, `duration`, `status`, `started_at`, `updated_at`, `stopped_at`
FROM `media_play_states`;--> statement-breakpoint
DROP TABLE `collection_items`;--> statement-breakpoint
DROP TABLE `people_media`;--> statement-breakpoint
DROP TABLE `media_play_states`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
DROP TABLE `media_items`;--> statement-breakpoint
DROP TABLE `collections`;--> statement-breakpoint
DROP TABLE `libraries`;--> statement-breakpoint
DROP TABLE `people`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
ALTER TABLE `__new_libraries` RENAME TO `libraries`;--> statement-breakpoint
ALTER TABLE `__new_collections` RENAME TO `collections`;--> statement-breakpoint
ALTER TABLE `__new_media_items` RENAME TO `media_items`;--> statement-breakpoint
ALTER TABLE `__new_people` RENAME TO `people`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
ALTER TABLE `__new_people_media` RENAME TO `people_media`;--> statement-breakpoint
ALTER TABLE `__new_collection_items` RENAME TO `collection_items`;--> statement-breakpoint
ALTER TABLE `__new_media_play_states` RENAME TO `media_play_states`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_public_id_unique` ON `users` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_public_id_unique` ON `sessions` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_userId_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `libraries_public_id_unique` ON `libraries` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collections_public_id_unique` ON `collections` (`public_id`);--> statement-breakpoint
CREATE INDEX `collections_type_idx` ON `collections` (`type`);--> statement-breakpoint
CREATE INDEX `collections_title_idx` ON `collections` (`title`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_items_public_id_unique` ON `media_items` (`public_id`);--> statement-breakpoint
CREATE INDEX `media_items_media_type_idx` ON `media_items` (`media_type`);--> statement-breakpoint
CREATE INDEX `media_items_file_path_idx` ON `media_items` (`file_path`);--> statement-breakpoint
CREATE INDEX `media_items_data_source_path_idx` ON `media_items` (`data_source_id`,`file_path`);--> statement-breakpoint
CREATE INDEX `media_items_title_idx` ON `media_items` (`title`);--> statement-breakpoint
CREATE INDEX `media_items_library_id_idx` ON `media_items` (`library_id`);--> statement-breakpoint
CREATE INDEX `media_items_created_at_idx` ON `media_items` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `people_public_id_unique` ON `people` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `people_name_idx` ON `people` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `people_media_public_id_unique` ON `people_media` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `people_media_person_media_role_idx` ON `people_media` (`person_id`,`media_id`,`role`);--> statement-breakpoint
CREATE INDEX `media_play_states_user_updated_idx` ON `media_play_states` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `media_items_featured_idx` ON `media_items` (json_extract(`metadata`, '$.voteAverage')) WHERE json_extract(`metadata`, '$.images.backdrop') IS NOT NULL;--> statement-breakpoint
CREATE VIRTUAL TABLE `media_fts` USING fts5(
	`id` UNINDEXED,
	`title`,
	`description`,
	`file_path`,
	`tags`,
	`metadata_text`,
	tokenize = 'unicode61 remove_diacritics 2'
);--> statement-breakpoint
INSERT INTO `media_fts` (`id`, `title`, `description`, `file_path`, `tags`, `metadata_text`)
SELECT
	`id`, `title`, coalesce(`description`, ''), `file_path`, coalesce(`tags`, '[]'),
	coalesce((
		SELECT group_concat(cast(`metadata_value`.`atom` AS text), ' ')
		FROM json_tree(CASE WHEN json_valid(`media_items`.`metadata`) THEN `media_items`.`metadata` ELSE '{}' END) AS `metadata_value`
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
FROM `media_items`;--> statement-breakpoint
CREATE TRIGGER `media_items_fts_insert`
AFTER INSERT ON `media_items`
BEGIN
	INSERT INTO `media_fts` (`id`, `title`, `description`, `file_path`, `tags`, `metadata_text`)
	VALUES (
		new.`id`, new.`title`, coalesce(new.`description`, ''), new.`file_path`, coalesce(new.`tags`, '[]'),
		coalesce((
			SELECT group_concat(cast(`metadata_value`.`atom` AS text), ' ')
			FROM json_tree(CASE WHEN json_valid(new.`metadata`) THEN new.`metadata` ELSE '{}' END) AS `metadata_value`
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
		new.`id`, new.`title`, coalesce(new.`description`, ''), new.`file_path`, coalesce(new.`tags`, '[]'),
		coalesce((
			SELECT group_concat(cast(`metadata_value`.`atom` AS text), ' ')
			FROM json_tree(CASE WHEN json_valid(new.`metadata`) THEN new.`metadata` ELSE '{}' END) AS `metadata_value`
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
END;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_key_check;
