CREATE TABLE "scheduled_post_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_post_id" uuid NOT NULL,
	"type" varchar(30) DEFAULT 'meta_page' NOT NULL,
	"connection_id" uuid,
	"ref_id" varchar(80) NOT NULL,
	"label" varchar(160),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"post_id" varchar(60),
	"error" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_posts" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ALTER COLUMN "page_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_post_targets" ADD CONSTRAINT "scheduled_post_targets_scheduled_post_id_scheduled_posts_id_fk" FOREIGN KEY ("scheduled_post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_post_targets" ADD CONSTRAINT "scheduled_post_targets_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sp_targets_post" ON "scheduled_post_targets" USING btree ("scheduled_post_id","status");
--> statement-breakpoint
-- Backfill: bài đơn đích cũ sinh target tương ứng — worker mới chỉ đọc target.
INSERT INTO scheduled_post_targets (scheduled_post_id, type, connection_id, ref_id, status, post_id, published_at)
SELECT sp.id, 'meta_page', sp.connection_id, sp.page_id,
  CASE sp.status WHEN 'published' THEN 'published' WHEN 'failed' THEN 'failed'
                 WHEN 'cancelled' THEN 'cancelled' ELSE 'pending' END,
  CASE WHEN sp.status = 'published' THEN sp.post_id END,
  CASE WHEN sp.status = 'published' THEN sp.published_at END
FROM scheduled_posts sp
WHERE sp.page_id IS NOT NULL AND sp.connection_id IS NOT NULL;
