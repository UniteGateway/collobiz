CREATE TABLE "deal_passport_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passport_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" text NOT NULL,
	"nda_hash" text NOT NULL,
	"nda_accepted_at" timestamp with time zone,
	"nda_accepted_by" uuid,
	"nda_typed_name" text,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deal_passports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"claim_id" uuid NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "deal_passports_code_unique" UNIQUE("code"),
	CONSTRAINT "deal_passports_claim_id_unique" UNIQUE("claim_id")
);
--> statement-breakpoint
CREATE TABLE "team_plan_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"message" text,
	"invited_by" uuid NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"roles" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"team_id" uuid,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tender_id" uuid,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"object_key" text NOT NULL,
	"pages" integer NOT NULL,
	"criteria" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_package_bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"days" integer NOT NULL,
	"note" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"submitted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"project_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"scope" text NOT NULL,
	"budget" bigint NOT NULL,
	"eligibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"awarded_org_id" uuid,
	"awarded_value" bigint,
	"progress" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_packages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "deal_passport_parties" ADD CONSTRAINT "deal_passport_parties_passport_id_deal_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."deal_passports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_passport_parties" ADD CONSTRAINT "deal_passport_parties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_passport_parties" ADD CONSTRAINT "deal_passport_parties_nda_accepted_by_users_id_fk" FOREIGN KEY ("nda_accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_passport_parties" ADD CONSTRAINT "deal_passport_parties_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_passports" ADD CONSTRAINT "deal_passports_claim_id_lead_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."lead_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_passports" ADD CONSTRAINT "deal_passports_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_plan_invites" ADD CONSTRAINT "team_plan_invites_plan_id_team_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."team_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_plan_invites" ADD CONSTRAINT "team_plan_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_plan_invites" ADD CONSTRAINT "team_plan_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_plans" ADD CONSTRAINT "team_plans_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_plans" ADD CONSTRAINT "team_plans_team_id_collaboration_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."collaboration_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_plans" ADD CONSTRAINT "team_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_plans" ADD CONSTRAINT "team_plans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_analyses" ADD CONSTRAINT "tender_analyses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_analyses" ADD CONSTRAINT "tender_analyses_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_analyses" ADD CONSTRAINT "tender_analyses_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_analyses" ADD CONSTRAINT "tender_analyses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_package_bids" ADD CONSTRAINT "work_package_bids_package_id_work_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."work_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_package_bids" ADD CONSTRAINT "work_package_bids_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_package_bids" ADD CONSTRAINT "work_package_bids_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_packages" ADD CONSTRAINT "work_packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_packages" ADD CONSTRAINT "work_packages_awarded_org_id_organizations_id_fk" FOREIGN KEY ("awarded_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_packages" ADD CONSTRAINT "work_packages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_passport_parties_uq" ON "deal_passport_parties" USING btree ("passport_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_plan_invites_uq" ON "team_plan_invites" USING btree ("plan_id","role_key","organization_id");--> statement-breakpoint
CREATE INDEX "team_plans_owner_idx" ON "team_plans" USING btree ("owner_org_id");--> statement-breakpoint
CREATE INDEX "tender_analyses_org_idx" ON "tender_analyses" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_package_bids_uq" ON "work_package_bids" USING btree ("package_id","organization_id");--> statement-breakpoint
CREATE INDEX "work_packages_project_idx" ON "work_packages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "work_packages_status_idx" ON "work_packages" USING btree ("status");