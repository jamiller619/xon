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
	`id`,
	`title`,
	coalesce(`description`, ''),
	`file_path`,
	coalesce(`tags`, '[]'),
	coalesce((
		SELECT group_concat(cast(`metadata_value`.`atom` AS text), ' ')
		FROM json_tree(
			CASE
				WHEN json_valid(`media_items`.`metadata`) THEN `media_items`.`metadata`
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
FROM `media_items`;--> statement-breakpoint
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
