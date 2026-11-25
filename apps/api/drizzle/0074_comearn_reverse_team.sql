CREATE TABLE "ce_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commission_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"status" text DEFAULT 'owed' NOT NULL,
	"reference" text,
	"paid_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ce_bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"model" text NOT NULL,
	"rate_bps" integer,
	"fixed_paise" bigint,
	"trigger" text NOT NULL,
	"payment_days" integer DEFAULT 30 NOT NULL,
	"proposal" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ce_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"city" text NOT NULL,
	"estimated_value_paise" bigint,
	"closes_on" date NOT NULL,
	"customer" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"selected_bid_id" uuid,
	"engagement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ce_requirements_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ce_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"role" text NOT NULL,
	"share_pct_bp" integer NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"match_percent" integer,
	"match_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invited_by" uuid,
	"responded_by" uuid,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ce_commissions" ADD COLUMN "tds_certificate_ref" text;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "featured_until" date;--> statement-breakpoint
ALTER TABLE "ce_allocations" ADD CONSTRAINT "ce_allocations_commission_id_ce_commissions_id_fk" FOREIGN KEY ("commission_id") REFERENCES "public"."ce_commissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_allocations" ADD CONSTRAINT "ce_allocations_team_member_id_ce_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."ce_team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_allocations" ADD CONSTRAINT "ce_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_bids" ADD CONSTRAINT "ce_bids_requirement_id_ce_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."ce_requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_bids" ADD CONSTRAINT "ce_bids_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_bids" ADD CONSTRAINT "ce_bids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_requirements" ADD CONSTRAINT "ce_requirements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_requirements" ADD CONSTRAINT "ce_requirements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_team_members" ADD CONSTRAINT "ce_team_members_engagement_id_ce_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."ce_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_team_members" ADD CONSTRAINT "ce_team_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_team_members" ADD CONSTRAINT "ce_team_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_team_members" ADD CONSTRAINT "ce_team_members_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ce_alloc_comm_member_uq" ON "ce_allocations" USING btree ("commission_id","team_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ce_bids_req_org_uq" ON "ce_bids" USING btree ("requirement_id","org_id");--> statement-breakpoint
CREATE INDEX "ce_req_status_idx" ON "ce_requirements" USING btree ("status","category");--> statement-breakpoint
CREATE INDEX "ce_req_org_idx" ON "ce_requirements" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ce_team_eng_org_uq" ON "ce_team_members" USING btree ("engagement_id","org_id");--> statement-breakpoint
CREATE INDEX "ce_team_org_idx" ON "ce_team_members" USING btree ("org_id");