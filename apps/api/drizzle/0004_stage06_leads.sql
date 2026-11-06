CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"city" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"consent_provenance" jsonb,
	"restricted_contacts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"organization_id" uuid,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'evidence' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"claimant_org_id" uuid NOT NULL,
	"respondent_org_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"ruling_reason" text,
	"panel_user_id" uuid,
	"previous_panel_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"appeal_deadline" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"candidate_claim_id" uuid NOT NULL,
	"score" double precision NOT NULL,
	"reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"ruling" text DEFAULT 'pending' NOT NULL,
	"ruling_reason" text,
	"ruled_by" uuid,
	"ruled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"introducer_org_id" uuid NOT NULL,
	"introducer_user_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"evidence_summary" text NOT NULL,
	"evidence_snapshot" jsonb NOT NULL,
	"evidence_hash" text NOT NULL,
	"consent" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"protected_from" timestamp with time zone,
	"protected_until" timestamp with time zone,
	"duplicate_score" double precision DEFAULT 0 NOT NULL,
	"certificate_code" text NOT NULL,
	"fee_trigger" text DEFAULT 'Customer payment received under the awarded contract (per commission addendum)' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"mime" text NOT NULL,
	"description" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"group_company_org_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"sla_minutes" integer NOT NULL,
	"calendar" jsonb NOT NULL,
	"paused_minutes" integer DEFAULT 0 NOT NULL,
	"paused_at" timestamp with time zone,
	"pause_reason" text,
	"escalated_at" timestamp with time zone,
	"urgent" boolean DEFAULT false NOT NULL,
	"decision" text,
	"reason" text,
	"actor_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_entries" ADD CONSTRAINT "dispute_entries_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_entries" ADD CONSTRAINT "dispute_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_entries" ADD CONSTRAINT "dispute_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_claimant_org_id_organizations_id_fk" FOREIGN KEY ("claimant_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_respondent_org_id_organizations_id_fk" FOREIGN KEY ("respondent_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_panel_user_id_users_id_fk" FOREIGN KEY ("panel_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_claim_id_lead_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."lead_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_candidate_claim_id_lead_claims_id_fk" FOREIGN KEY ("candidate_claim_id") REFERENCES "public"."lead_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_ruled_by_users_id_fk" FOREIGN KEY ("ruled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_claims" ADD CONSTRAINT "lead_claims_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_claims" ADD CONSTRAINT "lead_claims_introducer_org_id_organizations_id_fk" FOREIGN KEY ("introducer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_claims" ADD CONSTRAINT "lead_claims_introducer_user_id_users_id_fk" FOREIGN KEY ("introducer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_claims" ADD CONSTRAINT "lead_claims_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_claim_id_lead_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."lead_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_events" ADD CONSTRAINT "routing_events_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_events" ADD CONSTRAINT "routing_events_group_company_org_id_organizations_id_fk" FOREIGN KEY ("group_company_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_events" ADD CONSTRAINT "routing_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_org_idx" ON "customers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_code_uq" ON "disputes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "disputes_subject_idx" ON "disputes" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "dup_claim_idx" ON "duplicate_candidates" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_claims_opp_uq" ON "lead_claims" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_claims_cert_uq" ON "lead_claims" USING btree ("certificate_code");--> statement-breakpoint
CREATE INDEX "lead_claims_org_idx" ON "lead_claims" USING btree ("introducer_org_id");--> statement-breakpoint
CREATE INDEX "routing_open_idx" ON "routing_events" USING btree ("decided_at");--> statement-breakpoint
CREATE INDEX "routing_opp_idx" ON "routing_events" USING btree ("opportunity_id");