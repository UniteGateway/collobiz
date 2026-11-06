CREATE TABLE "business_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"head_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"sector" text NOT NULL,
	"description" text NOT NULL,
	"sku" text,
	"unit" text,
	"list_price" bigint,
	"currency" text DEFAULT 'INR' NOT NULL,
	"price_visibility" text DEFAULT 'verified_partners' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_companies" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"legal_entity_code" text NOT NULL,
	"brand_name" text NOT NULL,
	"sectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"billing_identity" text,
	"description" text,
	"website" text,
	"status" text DEFAULT 'active' NOT NULL,
	"sla_minutes" integer DEFAULT 240 NOT NULL,
	"calendar" jsonb DEFAULT '{"timezone":"Asia/Kolkata","workdays":[1,2,3,4,5],"startHour":9,"endHour":18,"holidays":[]}'::jsonb NOT NULL,
	"auto_release_on_breach" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "success_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"sector" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"partner_org_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"partner_consent" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_head_user_id_users_id_fk" FOREIGN KEY ("head_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_companies" ADD CONSTRAINT "group_companies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "success_stories" ADD CONSTRAINT "success_stories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_items_owner_idx" ON "catalog_items" USING btree ("owner_org_id");--> statement-breakpoint
CREATE INDEX "catalog_items_sector_idx" ON "catalog_items" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "catalog_items_fts_idx" ON "catalog_items" USING gin (to_tsvector('english', "name" || ' ' || "description"));--> statement-breakpoint
CREATE UNIQUE INDEX "group_companies_code_uq" ON "group_companies" USING btree ("legal_entity_code");