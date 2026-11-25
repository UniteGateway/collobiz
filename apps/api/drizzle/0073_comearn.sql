CREATE TABLE "ce_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"payer_org_id" uuid NOT NULL,
	"earner_org_id" uuid NOT NULL,
	"description" text NOT NULL,
	"milestone_index" integer,
	"base_paise" bigint NOT NULL,
	"gross_paise" bigint NOT NULL,
	"tds_paise" bigint DEFAULT 0 NOT NULL,
	"net_paise" bigint NOT NULL,
	"platform_fee_bps" integer DEFAULT 0 NOT NULL,
	"platform_fee_paise" bigint DEFAULT 0 NOT NULL,
	"platform_fee_payer" text,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"due_on" date,
	"verified_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	"received_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ce_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"raised_by_org_id" uuid NOT NULL,
	"raised_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"ruling" text,
	"ruled_by" uuid,
	"ruled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ce_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"earner_org_id" uuid NOT NULL,
	"earner_user_id" uuid NOT NULL,
	"stage" text DEFAULT 'selected' NOT NULL,
	"terms" jsonb,
	"terms_hash" text,
	"accepted_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ce_engagements_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ce_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"note" text,
	"amount_paise" bigint,
	"reference" text,
	"by_user_id" uuid NOT NULL,
	"by_org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ce_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"certificate_code" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_company" text,
	"city" text NOT NULL,
	"contact_name" text NOT NULL,
	"phone" text,
	"email" text,
	"gstin" text,
	"requirement" text NOT NULL,
	"estimated_value_paise" bigint,
	"fingerprint" text NOT NULL,
	"record_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ce_leads_engagement_id_unique" UNIQUE("engagement_id"),
	CONSTRAINT "ce_leads_certificate_code_unique" UNIQUE("certificate_code")
);
--> statement-breakpoint
CREATE TABLE "ce_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"ideal_earner" text,
	"territory" text NOT NULL,
	"estimated_value_paise" bigint,
	"model" text NOT NULL,
	"rate_bps" integer,
	"fixed_paise" bigint,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recurring_months" integer,
	"trigger" text NOT NULL,
	"payment_days" integer DEFAULT 30 NOT NULL,
	"max_earners" integer,
	"licence_note" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ce_opportunities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "ce_commissions" ADD CONSTRAINT "ce_commissions_engagement_id_ce_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."ce_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_commissions" ADD CONSTRAINT "ce_commissions_payer_org_id_organizations_id_fk" FOREIGN KEY ("payer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_commissions" ADD CONSTRAINT "ce_commissions_earner_org_id_organizations_id_fk" FOREIGN KEY ("earner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_commissions" ADD CONSTRAINT "ce_commissions_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_commissions" ADD CONSTRAINT "ce_commissions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_disputes" ADD CONSTRAINT "ce_disputes_engagement_id_ce_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."ce_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_disputes" ADD CONSTRAINT "ce_disputes_raised_by_org_id_organizations_id_fk" FOREIGN KEY ("raised_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_disputes" ADD CONSTRAINT "ce_disputes_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_disputes" ADD CONSTRAINT "ce_disputes_ruled_by_users_id_fk" FOREIGN KEY ("ruled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_engagements" ADD CONSTRAINT "ce_engagements_opportunity_id_ce_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."ce_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_engagements" ADD CONSTRAINT "ce_engagements_earner_org_id_organizations_id_fk" FOREIGN KEY ("earner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_engagements" ADD CONSTRAINT "ce_engagements_earner_user_id_users_id_fk" FOREIGN KEY ("earner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_events" ADD CONSTRAINT "ce_events_engagement_id_ce_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."ce_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_events" ADD CONSTRAINT "ce_events_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_events" ADD CONSTRAINT "ce_events_by_org_id_organizations_id_fk" FOREIGN KEY ("by_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_leads" ADD CONSTRAINT "ce_leads_engagement_id_ce_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."ce_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_leads" ADD CONSTRAINT "ce_leads_opportunity_id_ce_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."ce_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD CONSTRAINT "ce_opportunities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD CONSTRAINT "ce_opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ce_comm_earner_idx" ON "ce_commissions" USING btree ("earner_org_id");--> statement-breakpoint
CREATE INDEX "ce_comm_payer_idx" ON "ce_commissions" USING btree ("payer_org_id");--> statement-breakpoint
CREATE INDEX "ce_disputes_eng_idx" ON "ce_disputes" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ce_eng_opp_earner_uq" ON "ce_engagements" USING btree ("opportunity_id","earner_org_id");--> statement-breakpoint
CREATE INDEX "ce_eng_earner_idx" ON "ce_engagements" USING btree ("earner_org_id");--> statement-breakpoint
CREATE INDEX "ce_events_eng_idx" ON "ce_events" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ce_leads_opp_fp_uq" ON "ce_leads" USING btree ("opportunity_id","fingerprint");--> statement-breakpoint
CREATE INDEX "ce_opps_status_idx" ON "ce_opportunities" USING btree ("status","category");--> statement-breakpoint
CREATE INDEX "ce_opps_org_idx" ON "ce_opportunities" USING btree ("org_id");