CREATE TABLE "direct_offer_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"decline_reason" text,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direct_offer_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"mode" text NOT NULL,
	"price" bigint,
	"price_unit" text,
	"reward_model" text NOT NULL,
	"reward_bps" integer,
	"reward_amount" bigint,
	"manpower" integer,
	"has_office" boolean DEFAULT false NOT NULL,
	"office_location" text,
	"start_date" date,
	"message" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"terms_hash" text,
	"decided_by" uuid,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direct_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"issuer_org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"kind" text NOT NULL,
	"sector" text NOT NULL,
	"regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"target_mode" text NOT NULL,
	"target_filter" jsonb,
	"pricing" text NOT NULL,
	"unite_price" bigint,
	"price_unit" text,
	"unite_reward_model" text,
	"unite_reward_bps" integer,
	"unite_reward_amount" bigint,
	"reward_models" text[] NOT NULL,
	"needs_office" boolean DEFAULT false NOT NULL,
	"min_manpower" integer,
	"exclusive" boolean DEFAULT false NOT NULL,
	"max_selections" integer DEFAULT 1 NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_capacity" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"has_office" boolean DEFAULT false NOT NULL,
	"office_locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"total_manpower" integer DEFAULT 0 NOT NULL,
	"idle_manpower" integer DEFAULT 0 NOT NULL,
	"idle_skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"available_from" date,
	"looking_for" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "direct_offer_recipients" ADD CONSTRAINT "direct_offer_recipients_offer_id_direct_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."direct_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_offer_recipients" ADD CONSTRAINT "direct_offer_recipients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_offer_responses" ADD CONSTRAINT "direct_offer_responses_offer_id_direct_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."direct_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_offer_responses" ADD CONSTRAINT "direct_offer_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_offer_responses" ADD CONSTRAINT "direct_offer_responses_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_offer_responses" ADD CONSTRAINT "direct_offer_responses_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_offers" ADD CONSTRAINT "direct_offers_issuer_org_id_organizations_id_fk" FOREIGN KEY ("issuer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_offers" ADD CONSTRAINT "direct_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_capacity" ADD CONSTRAINT "partner_capacity_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_capacity" ADD CONSTRAINT "partner_capacity_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "direct_offer_recipients_uq" ON "direct_offer_recipients" USING btree ("offer_id","organization_id");--> statement-breakpoint
CREATE INDEX "direct_offer_recipients_org_idx" ON "direct_offer_recipients" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "direct_offer_responses_uq" ON "direct_offer_responses" USING btree ("offer_id","organization_id");--> statement-breakpoint
CREATE INDEX "direct_offer_responses_offer_idx" ON "direct_offer_responses" USING btree ("offer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "direct_offers_code_uq" ON "direct_offers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "direct_offers_issuer_idx" ON "direct_offers" USING btree ("issuer_org_id","status");