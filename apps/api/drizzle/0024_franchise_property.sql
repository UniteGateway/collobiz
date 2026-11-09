CREATE TABLE "franchise_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"month" text NOT NULL,
	"sales" bigint NOT NULL,
	"orders" integer NOT NULL,
	"royalty" bigint NOT NULL,
	"notes" text,
	"submitted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchise_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"brand_org_id" uuid NOT NULL,
	"franchisee_org_id" uuid NOT NULL,
	"format" text NOT NULL,
	"city" text NOT NULL,
	"region" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"fee" bigint,
	"royalty_bps" integer,
	"monthly_target" bigint,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision_note" text,
	"decided_by" uuid,
	"applied_by" uuid NOT NULL,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "franchise_units_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "property_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"city" text NOT NULL,
	"region" text NOT NULL,
	"description" text NOT NULL,
	"rera_number" text,
	"commission_bps" integer DEFAULT 200 NOT NULL,
	"open_to_partners" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'selling' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "property_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"unit_no" text NOT NULL,
	"unit_type" text NOT NULL,
	"area_sqft" integer NOT NULL,
	"price" bigint NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"held_by_org_id" uuid,
	"held_by_user_id" uuid,
	"held_until" timestamp with time zone,
	"buyer_name" text,
	"buyer_city" text,
	"consent_method" text,
	"agent_rera" text,
	"booked_at" timestamp with time zone,
	"sold_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_units_hold" CHECK ("property_units"."status" <> 'held' or ("property_units"."held_by_org_id" is not null and "property_units"."held_until" is not null))
);
--> statement-breakpoint
ALTER TABLE "group_companies" ADD COLUMN "franchise_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_reports" ADD CONSTRAINT "franchise_reports_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_reports" ADD CONSTRAINT "franchise_reports_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD CONSTRAINT "franchise_units_brand_org_id_organizations_id_fk" FOREIGN KEY ("brand_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD CONSTRAINT "franchise_units_franchisee_org_id_organizations_id_fk" FOREIGN KEY ("franchisee_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD CONSTRAINT "franchise_units_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD CONSTRAINT "franchise_units_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_projects" ADD CONSTRAINT "property_projects_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_projects" ADD CONSTRAINT "property_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_units" ADD CONSTRAINT "property_units_project_id_property_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."property_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_units" ADD CONSTRAINT "property_units_held_by_org_id_organizations_id_fk" FOREIGN KEY ("held_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_units" ADD CONSTRAINT "property_units_held_by_user_id_users_id_fk" FOREIGN KEY ("held_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_reports_unit_month_uq" ON "franchise_reports" USING btree ("unit_id","month");--> statement-breakpoint
CREATE INDEX "franchise_units_brand_idx" ON "franchise_units" USING btree ("brand_org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_units_active_uq" ON "franchise_units" USING btree ("franchisee_org_id","brand_org_id",lower("city")) WHERE status not in ('rejected', 'closed');--> statement-breakpoint
CREATE UNIQUE INDEX "property_units_project_no_uq" ON "property_units" USING btree ("project_id","unit_no");--> statement-breakpoint
CREATE INDEX "property_units_status_idx" ON "property_units" USING btree ("project_id","status");