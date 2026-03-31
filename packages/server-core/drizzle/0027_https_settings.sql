ALTER TABLE `server_settings` ADD `https_enabled` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `https_cert_path` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `https_key_path` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `acme_enabled` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `acme_domain` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `acme_email` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `acme_certs_dir` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `trust_proxy` integer NOT NULL DEFAULT 0;
