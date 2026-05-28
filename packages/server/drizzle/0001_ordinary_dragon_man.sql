PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_people_media` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`media_id` text NOT NULL,
	`role` text NOT NULL,
	`order` integer,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_people_media`("id", "person_id", "media_id", "role", "order") SELECT lower(hex(randomblob(16))), "person_id", "media_id", "role", "order" FROM `people_media`;--> statement-breakpoint
DROP TABLE `people_media`;--> statement-breakpoint
ALTER TABLE `__new_people_media` RENAME TO `people_media`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `people_media_person_media_role_idx` ON `people_media` (`person_id`,`media_id`,`role`);