CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`period` text NOT NULL,
	`priority` integer NOT NULL,
	`deadline` integer,
	`done` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lists_owner` ON `lists` (`owner`);--> statement-breakpoint
CREATE TABLE `mail_state` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`synced` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`filename` text,
	`file_key` text,
	`size` integer
);
--> statement-breakpoint
CREATE INDEX `notes_owner` ON `notes` (`owner`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`list_id` text NOT NULL,
	`title` text NOT NULL,
	`priority` integer NOT NULL,
	`deadline` integer,
	`done` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_owner_list` ON `tasks` (`owner`,`list_id`);