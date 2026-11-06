CREATE TABLE "commission_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"beneficiary_org_id" uuid NOT NULL,
	"payer_org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"lead_claim_id" uuid,
	"policy_id" uuid NOT NULL,
	"terms" jsonb NOT NULL,
	"terms_hash" text NOT NULL,
	"share_bps" integer DEFAULT 10000 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"beneficiary_org_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"project_invoice_id" uuid,
	"description" text NOT NULL,
	"base_amount" bigint NOT NULL,
	"gross" bigint NOT NULL,
	"share" bigint NOT NULL,
	"deductions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taxable" bigint NOT NULL,
	"gst" bigint NOT NULL,
	"tds" bigint NOT NULL,
	"payable" bigint NOT NULL,
	"status" text DEFAULT 'estimated' NOT NULL,
	"hold_reason" text,
	"earned_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"payout_id" uuid,
	"settled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"amount" bigint,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"sector" text,
	"basis" text NOT NULL,
	"rate_bps" integer,
	"flat_amount" bigint,
	"tiers" jsonb,
	"trigger" text DEFAULT 'customer_payment' NOT NULL,
	"tds_bps" integer DEFAULT 500 NOT NULL,
	"clawback_days" integer DEFAULT 90 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"legal_reviewed" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"activated_by" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"entry_id" uuid,
	"payout_id" uuid,
	"raised_by_org_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"expected_amount" bigint,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"resolution" text,
	"adjusted_amount" bigint,
	"prior_status" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolved_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"purpose" text NOT NULL,
	"amount" bigint NOT NULL,
	"tenor_months" integer,
	"consent_to_share" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"beneficiary_org_id" uuid NOT NULL,
	"partner_invoice_no" text NOT NULL,
	"taxable" bigint NOT NULL,
	"gst" bigint NOT NULL,
	"tds" bigint NOT NULL,
	"payable" bigint NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"bank_reference" text NOT NULL,
	"method" text DEFAULT 'neft' NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_beneficiary_org_id_organizations_id_fk" FOREIGN KEY ("beneficiary_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_payer_org_id_organizations_id_fk" FOREIGN KEY ("payer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_lead_claim_id_lead_claims_id_fk" FOREIGN KEY ("lead_claim_id") REFERENCES "public"."lead_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_policy_id_commission_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."commission_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_approvals" ADD CONSTRAINT "commission_approvals_entry_id_commission_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."commission_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_approvals" ADD CONSTRAINT "commission_approvals_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_agreement_id_commission_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."commission_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_beneficiary_org_id_organizations_id_fk" FOREIGN KEY ("beneficiary_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_project_invoice_id_project_invoices_id_fk" FOREIGN KEY ("project_invoice_id") REFERENCES "public"."project_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_journal" ADD CONSTRAINT "commission_journal_entry_id_commission_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."commission_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_journal" ADD CONSTRAINT "commission_journal_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_policies" ADD CONSTRAINT "commission_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_policies" ADD CONSTRAINT "commission_policies_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_disputes" ADD CONSTRAINT "finance_disputes_entry_id_commission_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."commission_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_disputes" ADD CONSTRAINT "finance_disputes_payout_id_payout_requests_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payout_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_disputes" ADD CONSTRAINT "finance_disputes_raised_by_org_id_organizations_id_fk" FOREIGN KEY ("raised_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_disputes" ADD CONSTRAINT "finance_disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_disputes" ADD CONSTRAINT "finance_disputes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_enquiries" ADD CONSTRAINT "finance_enquiries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_enquiries" ADD CONSTRAINT "finance_enquiries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_enquiries" ADD CONSTRAINT "finance_enquiries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_beneficiary_org_id_organizations_id_fk" FOREIGN KEY ("beneficiary_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payout_id_payout_requests_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payout_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_agreements_code_uq" ON "commission_agreements" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_agreements_project_beneficiary_uq" ON "commission_agreements" USING btree ("project_id","beneficiary_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_approvals_uq" ON "commission_approvals" USING btree ("entry_id","approver_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_agreement_milestone_uq" ON "commission_entries" USING btree ("agreement_id","milestone_id");--> statement-breakpoint
CREATE INDEX "commission_entries_beneficiary_idx" ON "commission_entries" USING btree ("beneficiary_org_id","status");--> statement-breakpoint
CREATE INDEX "commission_journal_entry_idx" ON "commission_journal" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_policies_code_ver_uq" ON "commission_policies" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_disputes_code_uq" ON "finance_disputes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_requests_code_uq" ON "payout_requests" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_requests_invoice_uq" ON "payout_requests" USING btree ("beneficiary_org_id","partner_invoice_no");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_payout_uq" ON "settlements" USING btree ("payout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_bank_ref_uq" ON "settlements" USING btree ("bank_reference");--> statement-breakpoint
CREATE OR REPLACE FUNCTION commission_journal_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'commission journal is append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER commission_journal_append_only BEFORE UPDATE OR DELETE ON commission_journal FOR EACH ROW EXECUTE FUNCTION commission_journal_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION settlements_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'settlements are immutable once recorded' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER settlements_immutable BEFORE UPDATE OR DELETE ON settlements FOR EACH ROW EXECUTE FUNCTION settlements_guard();
--> statement-breakpoint
-- No unearned payout: an entry can only be attached to a payout, or settled, if it was earned and approved.
CREATE OR REPLACE FUNCTION commission_entries_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.payout_id IS NOT NULL AND OLD.payout_id IS NULL AND (OLD.status <> 'approved' OR OLD.earned_at IS NULL OR OLD.approved_at IS NULL) THEN
    RAISE EXCEPTION 'commission entry % is not earned and approved; it cannot be paid', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'settled' AND (NEW.earned_at IS NULL OR NEW.approved_at IS NULL OR NEW.payout_id IS NULL) THEN
    RAISE EXCEPTION 'commission entry % cannot be settled without being earned, approved and requested', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status IN ('approved', 'invoiced', 'settled') AND (NEW.payable IS DISTINCT FROM OLD.payable OR NEW.taxable IS DISTINCT FROM OLD.taxable OR NEW.tds IS DISTINCT FROM OLD.tds OR NEW.gst IS DISTINCT FROM OLD.gst) THEN
    RAISE EXCEPTION 'commission entry % is approved; amounts are locked (use a dispute adjustment)', OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER commission_entries_guarded BEFORE UPDATE ON commission_entries FOR EACH ROW EXECUTE FUNCTION commission_entries_guard();
