CREATE TABLE "demo_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"note" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"ownership" text NOT NULL,
	"unit_value" bigint DEFAULT 0 NOT NULL,
	"chargeable" boolean DEFAULT false NOT NULL,
	"max_per_partner" integer DEFAULT 5 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchise_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchise_territories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"district" text NOT NULL,
	"pincodes" text[] DEFAULT '{}'::text[] NOT NULL,
	"exclusive" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"unit_id" uuid,
	"expires_on" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_cost" bigint NOT NULL,
	"reference" text NOT NULL,
	"serials" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream" text NOT NULL,
	"beneficiary_org_id" uuid NOT NULL,
	"unit_id" uuid,
	"source_ref" text NOT NULL,
	"order_id" uuid,
	"description" text NOT NULL,
	"base" bigint NOT NULL,
	"base_label" text NOT NULL,
	"rate_bps" integer NOT NULL,
	"amount" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"compliance" text,
	"settlement_id" uuid,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"beneficiary_org_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"entries" integer NOT NULL,
	"status" text DEFAULT 'payable' NOT NULL,
	"payment_reference" text,
	"paid_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "network_settlements_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "partner_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"unit_id" uuid,
	"product" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" text NOT NULL,
	"valid_to" text,
	"note" text,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"pincode" text,
	"order_id" uuid,
	"details" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" text,
	"resolution" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_requests_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "solar_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"brand" text NOT NULL,
	"model" text,
	"hsn" text NOT NULL,
	"gst_bps" integer NOT NULL,
	"specification" text NOT NULL,
	"warranty_months" integer NOT NULL,
	"mrp" bigint NOT NULL,
	"partner_price" bigint NOT NULL,
	"customer_price" bigint NOT NULL,
	"commission_bps" integer NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"serialised" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"datasheet_url" text,
	"installation" text,
	"kit_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solar_products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "solar_products_commission_ck" CHECK (commission_bps between 0 and 1000)
);
--> statement-breakpoint
CREATE TABLE "stock_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"number" text NOT NULL,
	"lines" jsonb NOT NULL,
	"value" bigint NOT NULL,
	"gst" bigint NOT NULL,
	"status" text DEFAULT 'dispatched' NOT NULL,
	"invoice_number" text NOT NULL,
	"received_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_allocations_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "store_inventory" (
	"unit_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_inventory_qty_ck" CHECK (qty >= 0)
);
--> statement-breakpoint
ALTER TABLE "franchise_orders" ADD COLUMN "fulfilment" text;--> statement-breakpoint
ALTER TABLE "franchise_orders" ADD COLUMN "fulfilment_status" text;--> statement-breakpoint
ALTER TABLE "franchise_orders" ADD COLUMN "payment_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_orders" ADD COLUMN "customer_phone" text;--> statement-breakpoint
ALTER TABLE "franchise_orders" ADD COLUMN "pincode" text;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "package_code" text;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "package_version" integer;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "lead_dna_addon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "pricing" jsonb;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "territory_id" uuid;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "pincode" text;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "district" text;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "payment_status" text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "payment_reference" text;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "payment_amount" bigint;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "payment_verified_by" uuid;--> statement-breakpoint
ALTER TABLE "demo_allocations" ADD CONSTRAINT "demo_allocations_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_allocations" ADD CONSTRAINT "demo_allocations_material_id_demo_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."demo_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_allocations" ADD CONSTRAINT "demo_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_packages" ADD CONSTRAINT "franchise_packages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_territories" ADD CONSTRAINT "franchise_territories_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_territories" ADD CONSTRAINT "franchise_territories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_solar_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."solar_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_commissions" ADD CONSTRAINT "network_commissions_beneficiary_org_id_organizations_id_fk" FOREIGN KEY ("beneficiary_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_commissions" ADD CONSTRAINT "network_commissions_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_commissions" ADD CONSTRAINT "network_commissions_order_id_franchise_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."franchise_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_commissions" ADD CONSTRAINT "network_commissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_beneficiary_org_id_organizations_id_fk" FOREIGN KEY ("beneficiary_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_entitlements" ADD CONSTRAINT "partner_entitlements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_entitlements" ADD CONSTRAINT "partner_entitlements_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_entitlements" ADD CONSTRAINT "partner_entitlements_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_order_id_franchise_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."franchise_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_products" ADD CONSTRAINT "solar_products_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_inventory" ADD CONSTRAINT "store_inventory_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_inventory" ADD CONSTRAINT "store_inventory_product_id_solar_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."solar_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_packages_code_ver_uq" ON "franchise_packages" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "franchise_territories_district_idx" ON "franchise_territories" USING btree ("state","district","status");--> statement-breakpoint
CREATE INDEX "inventory_movements_unit_idx" ON "inventory_movements" USING btree ("unit_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "network_commissions_uq" ON "network_commissions" USING btree ("stream","source_ref","beneficiary_org_id");--> statement-breakpoint
CREATE INDEX "network_commissions_org_idx" ON "network_commissions" USING btree ("beneficiary_org_id","status");--> statement-breakpoint
CREATE INDEX "partner_entitlements_org_idx" ON "partner_entitlements" USING btree ("org_id","product","status");--> statement-breakpoint
CREATE UNIQUE INDEX "store_inventory_uq" ON "store_inventory" USING btree ("unit_id","product_id");