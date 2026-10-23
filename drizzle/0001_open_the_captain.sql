CREATE TABLE "comment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"page_id" varchar(40) NOT NULL,
	"post_id" varchar(60) NOT NULL,
	"comment_id" varchar(60) NOT NULL,
	"parent_comment_id" varchar(60),
	"author_id" varchar(60),
	"author_name" varchar(255),
	"message" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"verb" varchar(20) DEFAULT 'add' NOT NULL,
	"source" varchar(20) DEFAULT 'webhook' NOT NULL,
	"rule_id" uuid,
	"rule_action" varchar(40),
	"reply_text" text,
	"private_reply_sent" boolean DEFAULT false NOT NULL,
	"fb_created_at" timestamp,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"page_id" varchar(40),
	"match_mode" varchar(10) DEFAULT 'any' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_event_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"webhook_id" uuid,
	"event" varchar(60) NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"status_code" integer,
	"latency_ms" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"url" text NOT NULL,
	"secret" varchar(120),
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_status" varchar(20),
	"last_error" text,
	"last_fired_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"page_id" varchar(40) NOT NULL,
	"page_name" varchar(255),
	"verify_token" varchar(64) NOT NULL,
	"subscribed_fields" jsonb DEFAULT '["feed"]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_event_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"page_id" varchar(40) NOT NULL,
	"message" text NOT NULL,
	"link_url" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video_url" text,
	"mode" varchar(20) DEFAULT 'schedule' NOT NULL,
	"scheduled_at" timestamp,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"post_id" varchar(60),
	"publish_error" text,
	"ai_policy_check" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "comment_events" ADD CONSTRAINT "comment_events_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_events" ADD CONSTRAINT "comment_events_rule_id_comment_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."comment_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_rules" ADD CONSTRAINT "comment_rules_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_event_logs" ADD CONSTRAINT "outbound_event_logs_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_event_logs" ADD CONSTRAINT "outbound_event_logs_webhook_id_outbound_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."outbound_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhooks" ADD CONSTRAINT "outbound_webhooks_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_subscriptions" ADD CONSTRAINT "page_subscriptions_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_subscriptions" ADD CONSTRAINT "page_subscriptions_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_event_unique" ON "comment_events" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "comment_events_biz" ON "comment_events" USING btree ("biz_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_events_page_post" ON "comment_events" USING btree ("page_id","post_id");--> statement-breakpoint
CREATE INDEX "comment_rules_biz" ON "comment_rules" USING btree ("biz_id");--> statement-breakpoint
CREATE INDEX "outbound_event_logs_biz" ON "outbound_event_logs" USING btree ("biz_id","created_at");--> statement-breakpoint
CREATE INDEX "outbound_webhooks_biz" ON "outbound_webhooks" USING btree ("biz_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pagesub_biz_page" ON "page_subscriptions" USING btree ("biz_id","page_id");--> statement-breakpoint
CREATE INDEX "scheduled_posts_biz" ON "scheduled_posts" USING btree ("biz_id","status","scheduled_at");