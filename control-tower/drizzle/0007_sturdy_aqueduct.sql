CREATE TABLE `business_builder_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`interview_id` int,
	`status` enum('pending','running','complete','error') NOT NULL DEFAULT 'pending',
	`prompts_total` int NOT NULL DEFAULT 30,
	`prompts_complete` int NOT NULL DEFAULT 0,
	`current_prompt` varchar(64),
	`error_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_builder_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_builder_runs_run_id_unique` UNIQUE(`run_id`)
);
--> statement-breakpoint
CREATE TABLE `business_interview_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`answers` text NOT NULL,
	`build_spec` text,
	`status` enum('in_progress','complete') NOT NULL DEFAULT 'in_progress',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_interview_answers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generated_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`prompt_id` varchar(64) NOT NULL,
	`prompt_title` varchar(256) NOT NULL,
	`category` varchar(64) NOT NULL,
	`content` text NOT NULL,
	`status` enum('pending','running','complete','error') NOT NULL DEFAULT 'pending',
	`deployed_to` varchar(128),
	`deployed_at` timestamp,
	`error_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generated_assets_id` PRIMARY KEY(`id`)
);
