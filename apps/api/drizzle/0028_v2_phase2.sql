CREATE TABLE "payment_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"reference" text NOT NULL,
	"received_at" date NOT NULL,
	"note" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolution_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolution_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"project_id" uuid,
	"raised_by_org_id" uuid NOT NULL,
	"against_org_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"statement" text NOT NULL,
	"amount" bigint,
	"status" text DEFAULT 'open' NOT NULL,
	"decision" text,
	"decision_note" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"appeal_note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resolution_cases_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "resolution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"org_id" uuid,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_agreement_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"body_hash" text NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"decision_rule" text NOT NULL,
	"authority" text NOT NULL,
	"body" text NOT NULL,
	"body_hash" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"pledged_value" bigint NOT NULL,
	"delivered_value" bigint,
	"evidence" text,
	"confirmed_by_org_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_invoices" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD COLUMN "overdue_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_invoice_id_project_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."project_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_assignments" ADD CONSTRAINT "resolution_assignments_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_assignments" ADD CONSTRAINT "resolution_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_cases" ADD CONSTRAINT "resolution_cases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_cases" ADD CONSTRAINT "resolution_cases_raised_by_org_id_organizations_id_fk" FOREIGN KEY ("raised_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_cases" ADD CONSTRAINT "resolution_cases_against_org_id_organizations_id_fk" FOREIGN KEY ("against_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_cases" ADD CONSTRAINT "resolution_cases_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_cases" ADD CONSTRAINT "resolution_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_events" ADD CONSTRAINT "resolution_events_case_id_resolution_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."resolution_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_events" ADD CONSTRAINT "resolution_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_events" ADD CONSTRAINT "resolution_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_agreement_approvals" ADD CONSTRAINT "team_agreement_approvals_agreement_id_team_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."team_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_agreement_approvals" ADD CONSTRAINT "team_agreement_approvals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_agreement_approvals" ADD CONSTRAINT "team_agreement_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_agreements" ADD CONSTRAINT "team_agreements_team_id_collaboration_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."collaboration_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_agreements" ADD CONSTRAINT "team_agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_contributions" ADD CONSTRAINT "team_contributions_team_id_collaboration_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."collaboration_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_contributions" ADD CONSTRAINT "team_contributions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_contributions" ADD CONSTRAINT "team_contributions_confirmed_by_org_id_organizations_id_fk" FOREIGN KEY ("confirmed_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_contributions" ADD CONSTRAINT "team_contributions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_receipts_invoice_idx" ON "payment_receipts" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_receipts_ref_uq" ON "payment_receipts" USING btree ("invoice_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_assignments_uq" ON "resolution_assignments" USING btree ("kind","source_id");--> statement-breakpoint
CREATE INDEX "resolution_events_case_idx" ON "resolution_events" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_agreement_approvals_uq" ON "team_agreement_approvals" USING btree ("agreement_id","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_agreements_version_uq" ON "team_agreements" USING btree ("team_id","version");--> statement-breakpoint
CREATE INDEX "team_contributions_team_idx" ON "team_contributions" USING btree ("team_id");