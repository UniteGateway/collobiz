CREATE SEQUENCE "public"."opportunity_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"sector" text NOT NULL,
	"kind" text NOT NULL,
	"route" text NOT NULL,
	"source" text NOT NULL,
	"city" text,
	"region" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"estimated_value" bigint,
	"currency" text DEFAULT 'INR' NOT NULL,
	"deadline" timestamp with time zone,
	"visibility" text DEFAULT 'verified_partners' NOT NULL,
	"min_level" text DEFAULT 'verified' NOT NULL,
	"required_certifications" text[] DEFAULT '{}'::text[] NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"group_company_org_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"listed" boolean DEFAULT false NOT NULL,
	"buyer_confidential" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"applicant_user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"proposed_value" bigint,
	"team_id" uuid,
	"status" text DEFAULT 'submitted' NOT NULL,
	"decision_reason" text,
	"decided_by" uuid,
	"eligibility_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"opportunity_id" uuid,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"submitted_by_user_id" uuid,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_opportunities" (
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_opportunities_user_id_opportunity_id_pk" PRIMARY KEY("user_id","opportunity_id")
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"query" jsonb NOT NULL,
	"alert" boolean DEFAULT true NOT NULL,
	"last_alert_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_group_company_org_id_organizations_id_fk" FOREIGN KEY ("group_company_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_applications" ADD CONSTRAINT "opportunity_applications_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_applications" ADD CONSTRAINT "opportunity_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_applications" ADD CONSTRAINT "opportunity_applications_applicant_user_id_users_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_applications" ADD CONSTRAINT "opportunity_applications_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_requests" ADD CONSTRAINT "rfq_requests_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_requests" ADD CONSTRAINT "rfq_requests_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_opportunities" ADD CONSTRAINT "saved_opportunities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_opportunities" ADD CONSTRAINT "saved_opportunities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_code_uq" ON "opportunities" USING btree ("code");--> statement-breakpoint
CREATE INDEX "opportunities_status_idx" ON "opportunities" USING btree ("status","listed");--> statement-breakpoint
CREATE INDEX "opportunities_sector_idx" ON "opportunities" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "opportunities_fts_idx" ON "opportunities" USING gin (to_tsvector('english', "title" || ' ' || "summary"));--> statement-breakpoint
CREATE INDEX "applications_opp_idx" ON "opportunity_applications" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_active_uq" ON "opportunity_applications" USING btree ("opportunity_id","organization_id") WHERE status <> 'withdrawn';--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_events_ver_uq" ON "opportunity_events" USING btree ("opportunity_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_ref_uq" ON "rfq_requests" USING btree ("reference");