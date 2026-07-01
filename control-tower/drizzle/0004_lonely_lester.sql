CREATE TABLE `founder_profile` (
	`id` int AUTO_INCREMENT NOT NULL,
	`business_name` varchar(256),
	`industry` varchar(256),
	`target_market` varchar(512),
	`delivery_email` varchar(320),
	`monthly_revenue_goal` varchar(128),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `founder_profile_id` PRIMARY KEY(`id`)
);
