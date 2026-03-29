CREATE TABLE `suggested_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`suggested_title` text NOT NULL,
	`suggested_type` text NOT NULL,
	`reason` text NOT NULL,
	`member_item_ids` text NOT NULL DEFAULT '[]',
	`confidence` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
-->statement-breakpoint
CREATE INDEX `suggested_groups_library_id_idx` ON `suggested_groups` (`library_id`);
-->statement-breakpoint
CREATE INDEX `suggested_groups_status_idx` ON `suggested_groups` (`status`);
