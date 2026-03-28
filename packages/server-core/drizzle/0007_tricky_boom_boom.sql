CREATE TABLE `library_access` (
	`user_id` text NOT NULL,
	`library_id` text NOT NULL,
	`granted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`granted_by` text NOT NULL,
	PRIMARY KEY(`user_id`, `library_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
