CREATE TABLE "promo_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"store" text,
	"order_id" uuid,
	"voucher_id" uuid,
	"item_ref" text NOT NULL,
	"units" integer NOT NULL,
	"value" bigint NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"promotion_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone10" text NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"store" text,
	"bill_no" text,
	"item_ref" text,
	"free_value" bigint,
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_vouchers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"buy_qty" integer DEFAULT 1 NOT NULL,
	"get_qty" integer DEFAULT 1 NOT NULL,
	"scope" text NOT NULL,
	"sectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"item_refs" text[] DEFAULT '{}'::text[] NOT NULL,
	"channel" text NOT NULL,
	"stores" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_free_per_order" integer DEFAULT 1 NOT NULL,
	"budget_units" integer,
	"budget_value" bigint,
	"used_units" integer DEFAULT 0 NOT NULL,
	"used_value" bigint DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"terms" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"erp_rule_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "solar_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"uploaded_by" uuid,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"extract" jsonb NOT NULL,
	"delete_after" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solar_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solar_configs_owner_org_id_unique" UNIQUE("owner_org_id")
);
--> statement-breakpoint
CREATE TABLE "solar_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"system" text NOT NULL,
	"capacity_w" integer NOT NULL,
	"panel_w" integer NOT NULL,
	"inverter_w" integer NOT NULL,
	"battery_wh" integer,
	"phase" integer DEFAULT 1 NOT NULL,
	"price" bigint NOT NULL,
	"warranty_years" integer NOT NULL,
	"includes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solar_kits_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "solar_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"partner_org_id" uuid,
	"created_by" uuid NOT NULL,
	"customer" jsonb NOT NULL,
	"phone10" text NOT NULL,
	"consent_method" text NOT NULL,
	"site" jsonb NOT NULL,
	"model" text NOT NULL,
	"system" text NOT NULL,
	"kit_id" uuid,
	"capacity_w" integer NOT NULL,
	"calc" jsonb NOT NULL,
	"total" bigint NOT NULL,
	"net" bigint NOT NULL,
	"commission" bigint NOT NULL,
	"bill_id" uuid,
	"referral_id" uuid,
	"notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"status_note" text,
	"valid_until" date NOT NULL,
	"commission_entry_id" uuid,
	"won_at" timestamp with time zone,
	"installed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solar_quotes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "solar_referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"owner_user_id" uuid,
	"owner_org_id" uuid,
	"owner_name" text NOT NULL,
	"owner_phone" text,
	"source_quote_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solar_referral_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "solar_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone10" text NOT NULL,
	"city" text NOT NULL,
	"region" text NOT NULL,
	"segment" text NOT NULL,
	"monthly_bill" bigint,
	"status" text DEFAULT 'new' NOT NULL,
	"quote_id" uuid,
	"reward" bigint,
	"rewarded_at" timestamp with time zone,
	"rewarded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"customer" jsonb NOT NULL,
	"phone10" text NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal" bigint NOT NULL,
	"free_value" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"referral_code_id" uuid,
	"status_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "commission_agreements" DROP CONSTRAINT "commission_agreements_source_ck";--> statement-breakpoint
ALTER TABLE "commission_entries" DROP CONSTRAINT "commission_entries_source_ck";--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "store_price" bigint;--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD COLUMN "solar_quote_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "solar_quote_id" uuid;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_order_id_store_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_voucher_id_promo_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."promo_vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_vouchers" ADD CONSTRAINT "promo_vouchers_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_vouchers" ADD CONSTRAINT "promo_vouchers_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_bills" ADD CONSTRAINT "solar_bills_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_bills" ADD CONSTRAINT "solar_bills_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_configs" ADD CONSTRAINT "solar_configs_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_configs" ADD CONSTRAINT "solar_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_kits" ADD CONSTRAINT "solar_kits_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_kits" ADD CONSTRAINT "solar_kits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_quotes" ADD CONSTRAINT "solar_quotes_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_quotes" ADD CONSTRAINT "solar_quotes_partner_org_id_organizations_id_fk" FOREIGN KEY ("partner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_quotes" ADD CONSTRAINT "solar_quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_quotes" ADD CONSTRAINT "solar_quotes_kit_id_solar_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."solar_kits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_quotes" ADD CONSTRAINT "solar_quotes_bill_id_solar_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."solar_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_quotes" ADD CONSTRAINT "solar_quotes_referral_id_solar_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."solar_referrals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_referral_codes" ADD CONSTRAINT "solar_referral_codes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_referral_codes" ADD CONSTRAINT "solar_referral_codes_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_referrals" ADD CONSTRAINT "solar_referrals_code_id_solar_referral_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."solar_referral_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_referrals" ADD CONSTRAINT "solar_referrals_rewarded_by_users_id_fk" FOREIGN KEY ("rewarded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_referral_code_id_solar_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."solar_referral_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_status_by_users_id_fk" FOREIGN KEY ("status_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promo_redemptions_promo_idx" ON "promo_redemptions" USING btree ("promotion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_vouchers_person_uq" ON "promo_vouchers" USING btree ("promotion_id","phone10");--> statement-breakpoint
CREATE INDEX "solar_kits_system_idx" ON "solar_kits" USING btree ("system","capacity_w");--> statement-breakpoint
CREATE INDEX "solar_quotes_partner_idx" ON "solar_quotes" USING btree ("partner_org_id","status");--> statement-breakpoint
CREATE INDEX "solar_quotes_status_idx" ON "solar_quotes" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "solar_ref_codes_user_uq" ON "solar_referral_codes" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "solar_ref_codes_quote_uq" ON "solar_referral_codes" USING btree ("source_quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "solar_referrals_phone_uq" ON "solar_referrals" USING btree ("phone10");--> statement-breakpoint
CREATE INDEX "solar_referrals_code_idx" ON "solar_referrals" USING btree ("code_id");--> statement-breakpoint
CREATE INDEX "store_orders_status_idx" ON "store_orders" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "commission_agreements" ADD CONSTRAINT "commission_agreements_source_ck" CHECK (project_id is not null or offer_id is not null or solar_quote_id is not null);--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_source_ck" CHECK (milestone_id is not null or offer_sale_id is not null or solar_quote_id is not null);