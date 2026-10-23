CREATE TABLE "desktop_auth_bridges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"email" varchar(255),
	"name" varchar(255),
	"session_cookie_name" varchar(80),
	"session_cookie_enc" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "desktop_auth_bridges" ADD CONSTRAINT "desktop_auth_bridges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "desktop_auth_bridges_expires" ON "desktop_auth_bridges" USING btree ("expires_at");