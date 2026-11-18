CREATE TABLE "capacity_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"units" integer NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"note" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"decision_note" text,
	"decided_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capacity_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"units" integer NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"rate_unit" text NOT NULL,
	"rate" double precision,
	"state" text NOT NULL,
	"city" text,
	"notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitment_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commitment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"evidence" text,
	"evidence_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_by_org" uuid,
	"verified_by" uuid
);
--> statement-breakpoint
CREATE TABLE "commitment_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commitment_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"role" text NOT NULL,
	"pledge" text NOT NULL,
	"pledged_at" timestamp with time zone,
	"pledged_by" uuid,
	"declined" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"deadline" date NOT NULL,
	"withdrawn" boolean DEFAULT false NOT NULL,
	"bound_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commitments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "demand_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"spec" text NOT NULL,
	"unit" text NOT NULL,
	"state" text NOT NULL,
	"target_qty" double precision NOT NULL,
	"join_by" date NOT NULL,
	"needed_by" date,
	"status" text DEFAULT 'open' NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demand_pools_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "launch_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"org_id" uuid NOT NULL,
	"model" text NOT NULL,
	"profile" jsonb NOT NULL,
	"stage" integer DEFAULT 0 NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "launch_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "micro_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "micro_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"state" text,
	"title" text NOT NULL,
	"scope" text NOT NULL,
	"acceptance" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit" text NOT NULL,
	"price_rs" integer NOT NULL,
	"due" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"worker_org_id" uuid,
	"delivery" text,
	"payment_ref" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "micro_contracts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "pool_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"qty" double precision NOT NULL,
	"status" text DEFAULT 'joined' NOT NULL,
	"accepted_quote_id" uuid,
	"accepted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"supplier_org_id" uuid NOT NULL,
	"unit_price_rs" double precision NOT NULL,
	"min_qty" double precision NOT NULL,
	"valid_until" date NOT NULL,
	"terms" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capacity_bookings" ADD CONSTRAINT "capacity_bookings_offer_id_capacity_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."capacity_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_bookings" ADD CONSTRAINT "capacity_bookings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_bookings" ADD CONSTRAINT "capacity_bookings_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_bookings" ADD CONSTRAINT "capacity_bookings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_offers" ADD CONSTRAINT "capacity_offers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_offers" ADD CONSTRAINT "capacity_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_conditions" ADD CONSTRAINT "commitment_conditions_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_conditions" ADD CONSTRAINT "commitment_conditions_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_conditions" ADD CONSTRAINT "commitment_conditions_verified_by_org_organizations_id_fk" FOREIGN KEY ("verified_by_org") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_conditions" ADD CONSTRAINT "commitment_conditions_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_parties" ADD CONSTRAINT "commitment_parties_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_parties" ADD CONSTRAINT "commitment_parties_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_parties" ADD CONSTRAINT "commitment_parties_pledged_by_users_id_fk" FOREIGN KEY ("pledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_pools" ADD CONSTRAINT "demand_pools_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_pools" ADD CONSTRAINT "demand_pools_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_plans" ADD CONSTRAINT "launch_plans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_plans" ADD CONSTRAINT "launch_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_applications" ADD CONSTRAINT "micro_applications_contract_id_micro_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."micro_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_applications" ADD CONSTRAINT "micro_applications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_applications" ADD CONSTRAINT "micro_applications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_contracts" ADD CONSTRAINT "micro_contracts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_contracts" ADD CONSTRAINT "micro_contracts_worker_org_id_organizations_id_fk" FOREIGN KEY ("worker_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_contracts" ADD CONSTRAINT "micro_contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_pool_id_demand_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."demand_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_quotes" ADD CONSTRAINT "pool_quotes_pool_id_demand_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."demand_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_quotes" ADD CONSTRAINT "pool_quotes_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_quotes" ADD CONSTRAINT "pool_quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capacity_bookings_offer_idx" ON "capacity_bookings" USING btree ("offer_id","status");--> statement-breakpoint
CREATE INDEX "capacity_offers_dates_idx" ON "capacity_offers" USING btree ("status","to_date");--> statement-breakpoint
CREATE UNIQUE INDEX "commitment_parties_uq" ON "commitment_parties" USING btree ("commitment_id","org_id");--> statement-breakpoint
CREATE INDEX "launch_plans_org_idx" ON "launch_plans" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "micro_applications_uq" ON "micro_applications" USING btree ("contract_id","org_id");--> statement-breakpoint
CREATE INDEX "micro_contracts_status_idx" ON "micro_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "micro_contracts_worker_idx" ON "micro_contracts" USING btree ("worker_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_members_uq" ON "pool_members" USING btree ("pool_id","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_quotes_uq" ON "pool_quotes" USING btree ("pool_id","supplier_org_id");