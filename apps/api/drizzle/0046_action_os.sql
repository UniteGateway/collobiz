CREATE TABLE "action_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid,
	"item_id" uuid,
	"channel" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"provider_ref" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_key" text NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"org_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by" uuid NOT NULL,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_app" text NOT NULL,
	"source_module" text NOT NULL,
	"source_record_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"record_url" text NOT NULL,
	"due_at" timestamp with time zone,
	"value_paise" bigint,
	"risk" text DEFAULT 'none' NOT NULL,
	"mandatory" boolean DEFAULT false NOT NULL,
	"verification" text DEFAULT 'confirmed' NOT NULL,
	"confidentiality" text DEFAULT 'normal' NOT NULL,
	"source_status" text DEFAULT '' NOT NULL,
	"band" text DEFAULT 'P3' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"score_parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rule" text,
	"status" text DEFAULT 'open' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"pinned" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"assigned_to" uuid,
	"escalated_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"done_note" text,
	"integration_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period_key" text NOT NULL,
	"time_zone" text NOT NULL,
	"summary" text NOT NULL,
	"counts" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"prefs" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_source_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_comments" ADD CONSTRAINT "action_comments_item_id_action_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."action_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_comments" ADD CONSTRAINT "action_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_deliveries" ADD CONSTRAINT "action_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_deliveries" ADD CONSTRAINT "action_deliveries_plan_id_action_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."action_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_deliveries" ADD CONSTRAINT "action_deliveries_item_id_action_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."action_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_feedback" ADD CONSTRAINT "action_feedback_item_id_action_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."action_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_feedback" ADD CONSTRAINT "action_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_integrations" ADD CONSTRAINT "action_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_preferences" ADD CONSTRAINT "action_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_source_events" ADD CONSTRAINT "action_source_events_integration_id_action_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."action_integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_source_events" ADD CONSTRAINT "action_source_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_comments_item_idx" ON "action_comments" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "action_deliveries_dedupe_uq" ON "action_deliveries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "action_deliveries_user_idx" ON "action_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "action_feedback_item_idx" ON "action_feedback" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "action_integrations_app_uq" ON "action_integrations" USING btree ("app_key");--> statement-breakpoint
CREATE UNIQUE INDEX "action_items_identity_uq" ON "action_items" USING btree ("user_id","source_app","source_record_id","kind");--> statement-breakpoint
CREATE INDEX "action_items_user_status_idx" ON "action_items" USING btree ("user_id","status","band");--> statement-breakpoint
CREATE UNIQUE INDEX "action_plans_period_uq" ON "action_plans" USING btree ("user_id","kind","period_key");--> statement-breakpoint
CREATE INDEX "action_plans_user_idx" ON "action_plans" USING btree ("user_id","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "action_source_events_uq" ON "action_source_events" USING btree ("integration_id","event_id");