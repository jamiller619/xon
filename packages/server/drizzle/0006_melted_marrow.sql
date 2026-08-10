ALTER TABLE `libraries` RENAME COLUMN "type" TO "content_type";--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
DROP TABLE `verifications`;
