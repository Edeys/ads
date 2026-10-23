CREATE TABLE "mcp_oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar(120) NOT NULL,
	"client_secret_hash" varchar(64) NOT NULL,
	"client_name" varchar(120),
	"redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"client_id" varchar(120) NOT NULL,
	"user_id" uuid NOT NULL,
	"biz_id" uuid NOT NULL,
	"key_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" varchar(200) DEFAULT 'mcp:read' NOT NULL,
	"code_challenge" varchar(128),
	"code_challenge_method" varchar(10),
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_oauth_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar(120) NOT NULL,
	"user_id" uuid NOT NULL,
	"biz_id" uuid NOT NULL,
	"key_id" uuid NOT NULL,
	"access_token_hash" varchar(64) NOT NULL,
	"refresh_token_hash" varchar(64),
	"scope" varchar(200) DEFAULT 'mcp:read' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_oauth_tokens_access_token_hash_unique" UNIQUE("access_token_hash")
);
--> statement-breakpoint
ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_key_id_mcp_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."mcp_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_key_id_mcp_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."mcp_keys"("id") ON DELETE cascade ON UPDATE no action;