CREATE TABLE "ad_table_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(20) NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"merge_accounts" boolean DEFAULT false NOT NULL,
	"default_level" varchar(10) DEFAULT 'campaign' NOT NULL,
	"custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_table_layouts" ADD CONSTRAINT "ad_table_layouts_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_table_layouts" ADD CONSTRAINT "ad_table_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_layout_user_platform" ON "ad_table_layouts" USING btree ("biz_id","user_id","platform");