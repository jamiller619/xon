-- Add hideDrmItems preference to users and libraries tables
ALTER TABLE `users` ADD COLUMN `hide_drm_items` INTEGER NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `libraries` ADD COLUMN `hide_drm_items` INTEGER NOT NULL DEFAULT 0;
