-- Groups table for auto-grouping media items (TV series, seasons, albums, etc.)
CREATE TABLE IF NOT EXISTS `groups` (
  `id` text PRIMARY KEY NOT NULL,
  `library_id` text NOT NULL REFERENCES `libraries`(`id`) ON DELETE CASCADE,
  `type` text NOT NULL,
  `title` text NOT NULL,
  `parent_group_id` text REFERENCES `groups`(`id`) ON DELETE CASCADE,
  `metadata` text NOT NULL DEFAULT '{}',
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `groups_library_id_idx` ON `groups` (`library_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `groups_parent_group_id_idx` ON `groups` (`parent_group_id`);
--> statement-breakpoint
-- Group members: maps media items to groups with a sort order
CREATE TABLE IF NOT EXISTS `group_members` (
  `group_id` text NOT NULL REFERENCES `groups`(`id`) ON DELETE CASCADE,
  `media_item_id` text NOT NULL REFERENCES `media_items`(`id`) ON DELETE CASCADE,
  `sort_order` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`group_id`, `media_item_id`)
);
