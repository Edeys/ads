CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" bigint,
	"token_type" varchar(40),
	"scope" text,
	"id_token" text
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" varchar(80) NOT NULL,
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"object_type" varchar(60),
	"object_id" varchar(80),
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"objective" varchar(60) NOT NULL,
	"destination" varchar(60) NOT NULL,
	"daily_budget" bigint NOT NULL,
	"spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"connection_id" uuid,
	"model" varchar(60),
	"purpose" varchar(40) NOT NULL,
	"tokens_in" integer DEFAULT 0,
	"tokens_out" integer DEFAULT 0,
	"cost_usd_micros" bigint DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autopilot_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" varchar(60) NOT NULL,
	"action" varchar(30) NOT NULL,
	"cpa" bigint,
	"reason" text,
	"ai_tokens_in" integer,
	"ai_tokens_out" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bizs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_personal" boolean DEFAULT false NOT NULL,
	"owner_id" uuid NOT NULL,
	"vat_tax_code" varchar(32),
	"vat_company_name" varchar(255),
	"vat_company_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bizs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "config_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" varchar(20) NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"type" varchar(30) NOT NULL,
	"name" varchar(160) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"credential_id" uuid,
	"interval_minutes" integer DEFAULT 30 NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'on' NOT NULL,
	"last_run_at" timestamp,
	"last_run_status" varchar(20),
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"name" varchar(255) NOT NULL,
	"secret" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"health" varchar(20) DEFAULT 'ok' NOT NULL,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpa_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"platform" varchar(20) NOT NULL,
	"name" varchar(120) NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"min_data_pct" integer DEFAULT 120 NOT NULL,
	"max_pct" integer DEFAULT 200 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid,
	"provider" varchar(30) NOT NULL,
	"name" varchar(80) NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"currency" varchar(8) DEFAULT 'VND' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"tool" varchar(80) NOT NULL,
	"args" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"tool" varchar(80) NOT NULL,
	"latency_ms" integer,
	"ok" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"name" varchar(120),
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"scopes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"field_presets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skill_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"tier" varchar(20) DEFAULT 'trial' NOT NULL,
	"quota" jsonb DEFAULT '{"tkqc":3,"qlbh":1,"staff":1,"minSyncMinutes":30}'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"image" text,
	"phone_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_id" uuid NOT NULL,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_templates" ADD CONSTRAINT "ad_templates_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_actions" ADD CONSTRAINT "autopilot_actions_config_id_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bizs" ADD CONSTRAINT "bizs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_runs" ADD CONSTRAINT "config_runs_config_id_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configs" ADD CONSTRAINT "configs_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configs" ADD CONSTRAINT "configs_credential_id_connections_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpa_thresholds" ADD CONSTRAINT "cpa_thresholds_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_presets" ADD CONSTRAINT "field_presets_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_approvals" ADD CONSTRAINT "mcp_approvals_key_id_mcp_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."mcp_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_approvals" ADD CONSTRAINT "mcp_approvals_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_call_logs" ADD CONSTRAINT "mcp_call_logs_key_id_mcp_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."mcp_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_keys" ADD CONSTRAINT "mcp_keys_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_biz_id_bizs_id_fk" FOREIGN KEY ("biz_id") REFERENCES "public"."bizs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_pair" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "activity_biz" ON "activity_logs" USING btree ("biz_id","created_at");--> statement-breakpoint
CREATE INDEX "ap_actions_config" ON "autopilot_actions" USING btree ("config_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_config" ON "config_runs" USING btree ("config_id","started_at");--> statement-breakpoint
CREATE INDEX "configs_biz_type" ON "configs" USING btree ("biz_id","type");--> statement-breakpoint
CREATE INDEX "connections_biz" ON "connections" USING btree ("biz_id");--> statement-breakpoint
CREATE INDEX "approvals_status" ON "mcp_approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mcp_logs_key" ON "mcp_call_logs" USING btree ("key_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "members_biz_user" ON "members" USING btree ("biz_id","user_id");