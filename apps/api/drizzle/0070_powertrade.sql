CREATE TABLE "pt_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"benefit_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"note" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"collaboration_id" uuid,
	"source" text NOT NULL,
	"description" text NOT NULL,
	"gross_paise" bigint NOT NULL,
	"costs_paise" bigint DEFAULT 0 NOT NULL,
	"taxes_paise" bigint DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"collected_paise" bigint DEFAULT 0 NOT NULL,
	"collection_ref" text,
	"evidence" text,
	"source_ref" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"sample" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_collaborations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"model" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"org_id" uuid NOT NULL,
	"counterparty_org_id" uuid,
	"supply_value_paise" bigint,
	"benefit_value_paise" bigint,
	"power_tariff_paise_per_kwh" integer,
	"power_units_per_month" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"documents" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tax_review" text DEFAULT 'pending' NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contract_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pt_collaborations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "pt_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"capacity" text,
	"locations" text,
	"export_capable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_energy_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"monthly_units" integer NOT NULL,
	"tariff_paise_per_kwh" integer NOT NULL,
	"contract_demand_kva" double precision NOT NULL,
	"voltage_kv" double precision NOT NULL,
	"consumer_category" text NOT NULL,
	"peak_share_pct" double precision,
	"preferred_sources" text[] NOT NULL,
	"rtc_needed" boolean DEFAULT false NOT NULL,
	"ppa_years" integer NOT NULL,
	"rooftop_kwp" double precision DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_energy_savings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period" text NOT NULL,
	"baseline_paise" bigint NOT NULL,
	"actual_paise" bigint NOT NULL,
	"evidence" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"industry" text NOT NULL,
	"state" text NOT NULL,
	"discom" text,
	"gstin" text,
	"about" text,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"share_products" boolean DEFAULT true NOT NULL,
	"share_energy_summary" boolean DEFAULT false NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pt_profiles_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "pt_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inputs" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"illustrative" boolean NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pt_allocations" ADD CONSTRAINT "pt_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_allocations" ADD CONSTRAINT "pt_allocations_benefit_id_pt_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."pt_benefits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_allocations" ADD CONSTRAINT "pt_allocations_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_allocations" ADD CONSTRAINT "pt_allocations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_benefits" ADD CONSTRAINT "pt_benefits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_benefits" ADD CONSTRAINT "pt_benefits_collaboration_id_pt_collaborations_id_fk" FOREIGN KEY ("collaboration_id") REFERENCES "public"."pt_collaborations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_benefits" ADD CONSTRAINT "pt_benefits_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_benefits" ADD CONSTRAINT "pt_benefits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_collaborations" ADD CONSTRAINT "pt_collaborations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_collaborations" ADD CONSTRAINT "pt_collaborations_counterparty_org_id_organizations_id_fk" FOREIGN KEY ("counterparty_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_collaborations" ADD CONSTRAINT "pt_collaborations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_contributions" ADD CONSTRAINT "pt_contributions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_contributions" ADD CONSTRAINT "pt_contributions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_energy_needs" ADD CONSTRAINT "pt_energy_needs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_energy_needs" ADD CONSTRAINT "pt_energy_needs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_energy_savings" ADD CONSTRAINT "pt_energy_savings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_energy_savings" ADD CONSTRAINT "pt_energy_savings_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_energy_savings" ADD CONSTRAINT "pt_energy_savings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_profiles" ADD CONSTRAINT "pt_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_profiles" ADD CONSTRAINT "pt_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_scenarios" ADD CONSTRAINT "pt_scenarios_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_scenarios" ADD CONSTRAINT "pt_scenarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pt_alloc_org_idx" ON "pt_allocations" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "pt_benefit_org_idx" ON "pt_benefits" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pt_benefit_source_ref_uq" ON "pt_benefits" USING btree ("org_id","source_ref");--> statement-breakpoint
CREATE INDEX "pt_collab_org_idx" ON "pt_collaborations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pt_collab_cp_idx" ON "pt_collaborations" USING btree ("counterparty_org_id");--> statement-breakpoint
CREATE INDEX "pt_contrib_org_idx" ON "pt_contributions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pt_energy_org_idx" ON "pt_energy_needs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pt_savings_org_period_uq" ON "pt_energy_savings" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "pt_scen_org_idx" ON "pt_scenarios" USING btree ("org_id","created_at");