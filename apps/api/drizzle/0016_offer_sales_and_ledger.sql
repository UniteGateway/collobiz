CREATE TABLE "offer_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"offer_id" uuid NOT NULL,
	"response_id" uuid NOT NULL,
	"partner_org_id" uuid NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_key" text NOT NULL,
	"buyer_city" text NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"description" text NOT NULL,
	"estimated_value" bigint,
	"consent_method" text NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"sale_value" bigint,
	"invoice_number" text,
	"payment_reference" text,
	"paid_at" timestamp with time zone,
	"lost_reason" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_agreements" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_entries" ALTER COLUMN "milestone_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "offer_response_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD COLUMN "offer_response_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "offer_sale_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_sales" ADD CONSTRAINT "offer_sales_offer_id_direct_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."direct_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_sales" ADD CONSTRAINT "offer_sales_response_id_direct_offer_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."direct_offer_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_sales" ADD CONSTRAINT "offer_sales_partner_org_id_organizations_id_fk" FOREIGN KEY ("partner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_sales" ADD CONSTRAINT "offer_sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_sales_code_uq" ON "offer_sales" USING btree ("code");--> statement-breakpoint
CREATE INDEX "offer_sales_offer_idx" ON "offer_sales" USING btree ("offer_id","status");--> statement-breakpoint
CREATE INDEX "offer_sales_partner_idx" ON "offer_sales" USING btree ("partner_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_sales_buyer_uq" ON "offer_sales" USING btree ("offer_id","buyer_key") WHERE status not in ('lost', 'withdrawn');--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_offer_id_direct_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."direct_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_offer_response_id_direct_offer_responses_id_fk" FOREIGN KEY ("offer_response_id") REFERENCES "public"."direct_offer_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_offer_id_direct_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."direct_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_offer_response_id_direct_offer_responses_id_fk" FOREIGN KEY ("offer_response_id") REFERENCES "public"."direct_offer_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_offer_sale_id_offer_sales_id_fk" FOREIGN KEY ("offer_sale_id") REFERENCES "public"."offer_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_agreements_offer_response_uq" ON "commission_agreements" USING btree ("offer_response_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_agreement_sale_uq" ON "commission_entries" USING btree ("agreement_id","offer_sale_id");--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_source_ck" CHECK (project_id is not null or offer_id is not null);--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_source_ck" CHECK (milestone_id is not null or offer_sale_id is not null);