CREATE TABLE `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`user_name` varchar(128),
	`action` varchar(64) NOT NULL,
	`service` varchar(64) NOT NULL,
	`detail` text,
	`outcome` enum('success','failure') NOT NULL DEFAULT 'success',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `health_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service` varchar(64) NOT NULL,
	`status` enum('healthy','warning','down') NOT NULL,
	`uptime` varchar(64),
	`cpu_percent` float,
	`mem_usage_mb` float,
	`mem_limit_mb` float,
	`mem_percent` float,
	`net_rx_mb` float,
	`net_tx_mb` float,
	`raw_json` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `health_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `log_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service` varchar(64) NOT NULL,
	`lines` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `log_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stats_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service` varchar(64) NOT NULL,
	`cpu_percent` float NOT NULL DEFAULT 0,
	`mem_usage_mb` float NOT NULL DEFAULT 0,
	`mem_percent` float NOT NULL DEFAULT 0,
	`net_rx_mb` float NOT NULL DEFAULT 0,
	`net_tx_mb` float NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stats_readings_id` PRIMARY KEY(`id`)
);
