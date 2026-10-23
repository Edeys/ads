CREATE TABLE "custom_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"input_schema" jsonb DEFAULT '{"type":"object","properties":{},"required":[]}'::jsonb NOT NULL,
	"method" varchar(10) DEFAULT 'GET' NOT NULL,
	"url" text NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body_template" text,
	"secret_ref" varchar(80),
	"requires_approval" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_tools" ADD CONSTRAINT "custom_tools_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_tool_biz_name" ON "custom_tools" USING btree ("biz_id","name");