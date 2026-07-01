CREATE TABLE `vault_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`status` enum('pending','ready','downloaded','expired') NOT NULL DEFAULT 'pending',
	`services_provisioned` text,
	`credential_data` text,
	`download_token` varchar(128),
	`token_expires_at` timestamp,
	`downloaded_at` timestamp,
	`delivery_email` varchar(320),
	`raw_output` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vault_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `vault_deliveries_run_id_unique` UNIQUE(`run_id`),
	CONSTRAINT `vault_deliveries_download_token_unique` UNIQUE(`download_token`)
);
