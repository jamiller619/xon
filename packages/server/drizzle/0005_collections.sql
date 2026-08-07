CREATE TABLE `__new_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`parent_collection_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_collections` (
	`id`,
	`created_at`,
	`updated_at`,
	`user_id`,
	`type`,
	`title`,
	`parent_collection_id`,
	`metadata`
)
SELECT
	replace(`id`, 'grp:', 'col:'),
	`created_at`,
	`updated_at`,
	`user_id`,
	`type`,
	`title`,
	replace(`parent_group_id`, 'grp:', 'col:'),
	`metadata`
FROM `groups`;
--> statement-breakpoint
CREATE TABLE `__new_collection_items` (
	`collection_id` text NOT NULL,
	`media_item_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`collection_id`, `media_item_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `__new_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_collection_items` (`collection_id`, `media_item_id`, `sort_order`)
SELECT
	replace(`group_id`, 'grp:', 'col:'),
	`media_item_id`,
	`sort_order`
FROM `group_items`;
--> statement-breakpoint
DROP TABLE `group_items`;
--> statement-breakpoint
DROP TABLE `groups`;
--> statement-breakpoint
ALTER TABLE `__new_collections` RENAME TO `collections`;
--> statement-breakpoint
ALTER TABLE `__new_collection_items` RENAME TO `collection_items`;
--> statement-breakpoint
CREATE INDEX `collections_type_idx` ON `collections` (`type`);
--> statement-breakpoint
CREATE INDEX `collections_title_idx` ON `collections` (`title`);
