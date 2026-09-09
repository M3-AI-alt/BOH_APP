CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`record_id` text NOT NULL,
	`before` text,
	`after` text
);
--> statement-breakpoint
CREATE INDEX `idx_activity_at` ON `activity` (`at`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`class_id` text DEFAULT '' NOT NULL,
	`student_id` text DEFAULT '' NOT NULL,
	`date` text DEFAULT '' NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_records_kind_date` ON `records` (`kind`,`date`);--> statement-breakpoint
CREATE INDEX `idx_records_class_kind` ON `records` (`class_id`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_records_student_kind` ON `records` (`student_id`,`kind`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`class_ids` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_staff_user` ON `staff` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_staff_email` ON `staff` (`email`);