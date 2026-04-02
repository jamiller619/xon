CREATE TABLE `backup_targets` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL DEFAULT 'local',
  `config` text NOT NULL DEFAULT '{}',
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
