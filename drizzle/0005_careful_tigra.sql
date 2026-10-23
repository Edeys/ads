CREATE TABLE "ad_metric_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(20) NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"merge_accounts" boolean DEFAULT true NOT NULL,
	"default_level" varchar(10) DEFAULT 'campaign' NOT NULL,
	"custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"level" varchar(20) DEFAULT 'info' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"href" varchar(300),
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" varchar(20) DEFAULT 'support' NOT NULL,
	"subject" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"admin_reply" text,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_metric_views" ADD CONSTRAINT "ad_metric_views_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_metric_views" ADD CONSTRAINT "ad_metric_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_view_user_platform" ON "ad_metric_views" USING btree ("biz_id","user_id","platform");--> statement-breakpoint
CREATE INDEX "notifications_biz" ON "notifications" USING btree ("biz_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "support_threads_biz" ON "support_threads" USING btree ("biz_id","status","last_message_at");