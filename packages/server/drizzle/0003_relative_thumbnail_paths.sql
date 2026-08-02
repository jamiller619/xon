-- Application-level data migrations use this ledger so JSON transformations
-- can be retried safely if startup is interrupted.
CREATE TABLE `xon_data_migrations` (
	`id` text PRIMARY KEY NOT NULL,
	`applied_at` integer NOT NULL
);
