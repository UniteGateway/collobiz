CREATE TABLE "alliance_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"proposer_org_id" uuid NOT NULL,
	"target_org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"scope" text NOT NULL,
	"markets" text[] NOT NULL,
	"sectors" text[] NOT NULL,
	"proposer_share_pct" integer,
	"duration_months" integer NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_by" uuid NOT NULL,
	"decided_by" uuid,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alliance_proposals_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "content_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"locale" text DEFAULT 'en-IN' NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"updated_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"changed_by" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_partner_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"country" text NOT NULL,
	"sectors" text[] NOT NULL,
	"local_entity" text NOT NULL,
	"local_registration" text NOT NULL,
	"team_size" integer NOT NULL,
	"plan" text NOT NULL,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"submitted_by" uuid NOT NULL,
	"decided_by" uuid,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_territories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"country" text NOT NULL,
	"sectors" text[] NOT NULL,
	"exclusive" boolean DEFAULT false NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"application_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_border_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"direction" text NOT NULL,
	"product" text NOT NULL,
	"hs_code" text,
	"quantity" text NOT NULL,
	"origin_country" text NOT NULL,
	"destination_country" text NOT NULL,
	"incoterm" text DEFAULT 'FOB' NOT NULL,
	"target_date" date,
	"notes" text,
	"routed_to_org_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"response" text,
	"responded_at" timestamp with time zone,
	"checklist_done" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cross_border_enquiries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency" text NOT NULL,
	"inr_per_unit" numeric(14, 4) NOT NULL,
	"as_of" date NOT NULL,
	"source" text NOT NULL,
	"set_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"language" text DEFAULT 'en-IN' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"date_style" text DEFAULT 'dmy' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alliance_proposals" ADD CONSTRAINT "alliance_proposals_proposer_org_id_organizations_id_fk" FOREIGN KEY ("proposer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_proposals" ADD CONSTRAINT "alliance_proposals_target_org_id_organizations_id_fk" FOREIGN KEY ("target_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_proposals" ADD CONSTRAINT "alliance_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_proposals" ADD CONSTRAINT "alliance_proposals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_page_id_content_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."content_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_partner_applications" ADD CONSTRAINT "country_partner_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_partner_applications" ADD CONSTRAINT "country_partner_applications_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_partner_applications" ADD CONSTRAINT "country_partner_applications_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_territories" ADD CONSTRAINT "country_territories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_territories" ADD CONSTRAINT "country_territories_application_id_country_partner_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."country_partner_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_border_enquiries" ADD CONSTRAINT "cross_border_enquiries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_border_enquiries" ADD CONSTRAINT "cross_border_enquiries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_border_enquiries" ADD CONSTRAINT "cross_border_enquiries_routed_to_org_id_organizations_id_fk" FOREIGN KEY ("routed_to_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_target_idx" ON "alliance_proposals" USING btree ("target_org_id");--> statement-breakpoint
CREATE INDEX "ap_proposer_idx" ON "alliance_proposals" USING btree ("proposer_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_pages_slug_locale" ON "content_pages" USING btree ("slug","locale");--> statement-breakpoint
CREATE INDEX "cpa_status_idx" ON "country_partner_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ct_country_idx" ON "country_territories" USING btree ("country","status");--> statement-breakpoint
CREATE INDEX "cbe_org_idx" ON "cross_border_enquiries" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_unique" ON "fx_rates" USING btree ("currency","as_of");