CREATE TABLE `stripe_customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`stripe_customer_id` varchar(64) NOT NULL,
	`stripe_subscription_id` varchar(64),
	`subscription_status` varchar(32),
	`current_period_end` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stripe_customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_customers_stripe_customer_id_unique` UNIQUE(`stripe_customer_id`)
);
--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stripe_event_id` varchar(64) NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`processed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stripe_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_events_stripe_event_id_unique` UNIQUE(`stripe_event_id`)
);
