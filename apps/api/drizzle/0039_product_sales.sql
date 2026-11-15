CREATE TABLE "product_commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_org_id" uuid NOT NULL,
	"product_line" text,
	"category" text,
	"rate_bps" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_commission_rules_rate_ck" CHECK (rate_bps between 0 and 1000)
);
--> statement-breakpoint
CREATE TABLE "product_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"brand_org_id" uuid NOT NULL,
	"seller_org_id" uuid NOT NULL,
	"seller_user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_key" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"lines" jsonb NOT NULL,
	"requirement" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"protected_until" date NOT NULL,
	"quote_value" bigint,
	"order_value" bigint,
	"invoice_number" text,
	"payment_reference" text,
	"paid_at" timestamp with time zone,
	"rate_bps" integer,
	"commission_entry_id" uuid,
	"assigned_to" text,
	"lost_reason" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_enquiries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "commission_agreements" DROP CONSTRAINT "commission_agreements_source_ck";--> statement-breakpoint
ALTER TABLE "commission_entries" DROP CONSTRAINT "commission_entries_source_ck";--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD COLUMN "product_enquiry_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "product_enquiry_id" uuid;--> statement-breakpoint
ALTER TABLE "product_commission_rules" ADD CONSTRAINT "product_commission_rules_brand_org_id_organizations_id_fk" FOREIGN KEY ("brand_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_commission_rules" ADD CONSTRAINT "product_commission_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_enquiries" ADD CONSTRAINT "product_enquiries_brand_org_id_organizations_id_fk" FOREIGN KEY ("brand_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_enquiries" ADD CONSTRAINT "product_enquiries_seller_org_id_organizations_id_fk" FOREIGN KEY ("seller_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_enquiries" ADD CONSTRAINT "product_enquiries_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_commission_rules_uq" ON "product_commission_rules" USING btree ("brand_org_id",coalesce("product_line", ''),coalesce("category", ''));--> statement-breakpoint
CREATE INDEX "product_enquiries_seller_idx" ON "product_enquiries" USING btree ("seller_org_id","status");--> statement-breakpoint
CREATE INDEX "product_enquiries_brand_idx" ON "product_enquiries" USING btree ("brand_org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_enquiries_customer_uq" ON "product_enquiries" USING btree ("brand_org_id","customer_key") WHERE status not in ('lost', 'withdrawn');--> statement-breakpoint
CREATE UNIQUE INDEX "commission_agreements_product_enquiry_uq" ON "commission_agreements" USING btree ("product_enquiry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_product_enquiry_uq" ON "commission_entries" USING btree ("product_enquiry_id");--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_source_ck" CHECK (project_id is not null or offer_id is not null or solar_quote_id is not null or product_enquiry_id is not null);--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_source_ck" CHECK (milestone_id is not null or offer_sale_id is not null or solar_quote_id is not null or product_enquiry_id is not null);