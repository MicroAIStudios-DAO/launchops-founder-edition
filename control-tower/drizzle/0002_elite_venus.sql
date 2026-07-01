CREATE TABLE `alert_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service` varchar(64) NOT NULL,
	`last_status` enum('healthy','warning','down') NOT NULL DEFAULT 'healthy',
	`last_alert_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alert_state_id` PRIMARY KEY(`id`),
	CONSTRAINT `alert_state_service_unique` UNIQUE(`service`)
);
