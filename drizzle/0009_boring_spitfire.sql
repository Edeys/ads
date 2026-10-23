CREATE TABLE "conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"order_id" varchar(120) NOT NULL,
	"order_number" varchar(80),
	"revenue" bigint NOT NULL,
	"currency" varchar(10) DEFAULT 'VND' NOT NULL,
	"customer_email_sha256" varchar(64),
	"customer_phone_sha256" varchar(64),
	"customer_name" varchar(160),
	"source_platform" varchar(40) DEFAULT 'direct',
	"utm_source" varchar(120),
	"utm_medium" varchar(120),
	"utm_campaign" varchar(120),
	"fbp" varchar(120),
	"fbc" varchar(120),
	"gclid" text,
	"meta_capi_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"google_offline_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_matrix" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"source_post_id" uuid,
	"angle" varchar(80) NOT NULL,
	"framework" varchar(40) NOT NULL,
	"headline" varchar(255) NOT NULL,
	"hooks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body_copy" text NOT NULL,
	"call_to_action" varchar(120) NOT NULL,
	"target_audience" text,
	"media_asset_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"cluster_id" uuid,
	"post_type" varchar(30) DEFAULT 'cluster' NOT NULL,
	"title" varchar(300) NOT NULL,
	"slug" varchar(300) NOT NULL,
	"content_markdown" text NOT NULL,
	"content_html" text,
	"excerpt" text,
	"featured_image_url" text,
	"seo_score" integer DEFAULT 0,
	"meta_title" varchar(160),
	"meta_description" varchar(320),
	"focus_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schema_graph" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"internal_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"remote_post_id" varchar(80),
	"remote_url" text,
	"sync_status" varchar(20) DEFAULT 'success' NOT NULL,
	"indexing_google_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"indexing_indexnow_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_log" text,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"type" varchar(40) NOT NULL,
	"endpoint_url" text NOT NULL,
	"auth_type" varchar(40) DEFAULT 'application_password' NOT NULL,
	"credentials_enc" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"pillar_keyword" varchar(200) NOT NULL,
	"search_volume" integer DEFAULT 0,
	"intent" varchar(40) DEFAULT 'informational' NOT NULL,
	"status" varchar(20) DEFAULT 'planning' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_matrix" ADD CONSTRAINT "creative_matrix_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_matrix" ADD CONSTRAINT "creative_matrix_source_post_id_posts_id_fk" FOREIGN KEY ("source_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_cluster_id_topic_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."topic_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_sync_logs" ADD CONSTRAINT "site_sync_logs_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_sync_logs" ADD CONSTRAINT "site_sync_logs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_sync_logs" ADD CONSTRAINT "site_sync_logs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_clusters" ADD CONSTRAINT "topic_clusters_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conv_biz_order" ON "conversion_events" USING btree ("biz_id","order_id");--> statement-breakpoint
CREATE INDEX "conv_biz_created" ON "conversion_events" USING btree ("biz_id","created_at");--> statement-breakpoint
CREATE INDEX "creative_matrix_biz" ON "creative_matrix" USING btree ("biz_id");--> statement-breakpoint
CREATE INDEX "posts_biz" ON "posts" USING btree ("biz_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_biz_slug" ON "posts" USING btree ("biz_id","slug");--> statement-breakpoint
CREATE INDEX "site_sync_logs_post" ON "site_sync_logs" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "sites_biz" ON "sites" USING btree ("biz_id");--> statement-breakpoint
CREATE INDEX "topic_clusters_biz" ON "topic_clusters" USING btree ("biz_id","status");