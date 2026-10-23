ALTER TABLE "field_presets" ALTER COLUMN "provider" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "field_presets" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_keys" ADD COLUMN "field_config" jsonb DEFAULT '{}'::jsonb NOT NULL;