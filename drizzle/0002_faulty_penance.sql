ALTER TABLE "skills" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "platforms" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "file_name" varchar(200);--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;