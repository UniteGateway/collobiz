CREATE TABLE "eb5_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'Draft' NOT NULL,
	"terms" jsonb NOT NULL,
	"body" text NOT NULL,
	"body_hash" text NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"client_signed_name" text,
	"client_signed_at" timestamp with time zone,
	"client_signed_ip" text,
	"counter_signed_by" uuid,
	"counter_signed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eb5_agreements_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "eb5_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"data_enc" text NOT NULL,
	"photo_key" text,
	"signed_name" text,
	"submitted_at" timestamp with time zone,
	"review_note" text,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eb5_applications_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "eb5_case_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"stage" integer NOT NULL,
	"status_source" text NOT NULL,
	"note" text NOT NULL,
	"evidence_document_id" uuid,
	"visible_to_client" boolean DEFAULT false NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eb5_compensation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"lead_id" uuid,
	"description" text NOT NULL,
	"amount_cents" bigint,
	"status" text DEFAULT 'pending_legal' NOT NULL,
	"legal_reference" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eb5_consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"duration_min" integer DEFAULT 45 NOT NULL,
	"mode" text NOT NULL,
	"kind" text NOT NULL,
	"location" text,
	"agenda" text,
	"host_user_id" uuid NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"attendance" text,
	"notes" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eb5_doc_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eb5_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_by" uuid,
	"note" text,
	"object_key" text,
	"sha256" text,
	"mime" text,
	"size" integer,
	"version" integer DEFAULT 0 NOT NULL,
	"versions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uploaded_by" uuid,
	"review_note" text,
	"expires_on" date,
	"retain_until" date,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eb5_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"agreement_id" uuid,
	"ledger" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"due_on" date,
	"payment_reference" text,
	"payment_reported_at" timestamp with time zone,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"receipt_number" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eb5_invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "eb5_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"partner_id" uuid,
	"introduced_by" uuid,
	"source" text NOT NULL,
	"full_name" text NOT NULL,
	"country" text NOT NULL,
	"city" text,
	"contact_enc" text NOT NULL,
	"email_hash" text,
	"phone_hash" text,
	"family_members" text,
	"readiness" text NOT NULL,
	"timeline" text NOT NULL,
	"contact_preference" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_text" text NOT NULL,
	"assigned_manager_id" uuid,
	"stage" integer DEFAULT 0 NOT NULL,
	"follow_up_on" date,
	"notes" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicate_of" uuid,
	"ownership_dispute" jsonb,
	"client_user_id" uuid,
	"attorney_user_id" uuid,
	"project_id" uuid,
	"case_stage" integer DEFAULT 0 NOT NULL,
	"closed_reason" text,
	"demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eb5_leads_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "eb5_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"role" text DEFAULT 'bd_partner' NOT NULL,
	"jurisdiction" text NOT NULL,
	"specialization" text NOT NULL,
	"credentials" text,
	"contact_email" text NOT NULL,
	"i956k_status" text DEFAULT 'not_assessed' NOT NULL,
	"agreement_status" text DEFAULT 'none' NOT NULL,
	"compliance_status" text DEFAULT 'pending' NOT NULL,
	"compliance_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"link_token" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eb5_partners_link_token_unique" UNIQUE("link_token")
);
--> statement-breakpoint
CREATE TABLE "eb5_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sponsor" text NOT NULL,
	"regional_center" text,
	"location" text NOT NULL,
	"sector" text NOT NULL,
	"description" text NOT NULL,
	"investment_threshold_usd" integer,
	"offering_status" text DEFAULT 'proposed' NOT NULL,
	"claims" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"job_methodology" text,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"advisors" text,
	"demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eb5_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eb5_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"values" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eb5_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"title" text NOT NULL,
	"due_on" date NOT NULL,
	"assignee_id" uuid NOT NULL,
	"done_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eb5_agreements" ADD CONSTRAINT "eb5_agreements_lead_id_eb5_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."eb5_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_agreements" ADD CONSTRAINT "eb5_agreements_counter_signed_by_users_id_fk" FOREIGN KEY ("counter_signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_agreements" ADD CONSTRAINT "eb5_agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_applications" ADD CONSTRAINT "eb5_applications_lead_id_eb5_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."eb5_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_applications" ADD CONSTRAINT "eb5_applications_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_applications" ADD CONSTRAINT "eb5_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_case_milestones" ADD CONSTRAINT "eb5_case_milestones_lead_id_eb5_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."eb5_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_case_milestones" ADD CONSTRAINT "eb5_case_milestones_evidence_document_id_eb5_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."eb5_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_case_milestones" ADD CONSTRAINT "eb5_case_milestones_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_compensation" ADD CONSTRAINT "eb5_compensation_partner_id_eb5_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."eb5_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_compensation" ADD CONSTRAINT "eb5_compensation_lead_id_eb5_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."eb5_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_compensation" ADD CONSTRAINT "eb5_compensation_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_compensation" ADD CONSTRAINT "eb5_compensation_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_consultations" ADD CONSTRAINT "eb5_consultations_lead_id_eb5_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."eb5_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_consultations" ADD CONSTRAINT "eb5_consultations_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_doc_access" ADD CONSTRAINT "eb5_doc_access_document_id_eb5_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."eb5_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_doc_access" ADD CONSTRAINT "eb5_doc_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_documents" ADD CONSTRAINT "eb5_documents_lead_id_eb5_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."eb5_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_documents" ADD CONSTRAINT "eb5_documents_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_documents" ADD CONSTRAINT "eb5_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_invoices" ADD CONSTRAINT "eb5_invoices_lead_id_eb5_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."eb5_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_invoices" ADD CONSTRAINT "eb5_invoices_agreement_id_eb5_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."eb5_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_invoices" ADD CONSTRAINT "eb5_invoices_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_invoices" ADD CONSTRAINT "eb5_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_leads" ADD CONSTRAINT "eb5_leads_partner_id_eb5_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."eb5_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_leads" ADD CONSTRAINT "eb5_leads_introduced_by_users_id_fk" FOREIGN KEY ("introduced_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_leads" ADD CONSTRAINT "eb5_leads_assigned_manager_id_users_id_fk" FOREIGN KEY ("assigned_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_leads" ADD CONSTRAINT "eb5_leads_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_leads" ADD CONSTRAINT "eb5_leads_attorney_user_id_users_id_fk" FOREIGN KEY ("attorney_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_partners" ADD CONSTRAINT "eb5_partners_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_partners" ADD CONSTRAINT "eb5_partners_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_partners" ADD CONSTRAINT "eb5_partners_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_projects" ADD CONSTRAINT "eb5_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_roles" ADD CONSTRAINT "eb5_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_roles" ADD CONSTRAINT "eb5_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_settings" ADD CONSTRAINT "eb5_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_tasks" ADD CONSTRAINT "eb5_tasks_lead_id_eb5_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."eb5_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_tasks" ADD CONSTRAINT "eb5_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb5_tasks" ADD CONSTRAINT "eb5_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eb5_agreements_lead_idx" ON "eb5_agreements" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eb5_applications_lead_uq" ON "eb5_applications" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "eb5_case_lead_idx" ON "eb5_case_milestones" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "eb5_consultations_lead_idx" ON "eb5_consultations" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "eb5_doc_access_doc_idx" ON "eb5_doc_access" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "eb5_documents_lead_idx" ON "eb5_documents" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "eb5_invoices_lead_idx" ON "eb5_invoices" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "eb5_leads_partner_idx" ON "eb5_leads" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "eb5_leads_email_idx" ON "eb5_leads" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "eb5_leads_phone_idx" ON "eb5_leads" USING btree ("phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "eb5_partners_org_uq" ON "eb5_partners" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eb5_roles_uq" ON "eb5_roles" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "eb5_tasks_assignee_idx" ON "eb5_tasks" USING btree ("assignee_id");