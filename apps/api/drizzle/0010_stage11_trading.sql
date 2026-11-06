CREATE TABLE "enquiry_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"author_org_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "po_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text,
	"data" jsonb,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"buyer_org_id" uuid NOT NULL,
	"supplier_org_id" uuid NOT NULL,
	"quotation_id" uuid,
	"project_id" uuid,
	"project_material_id" uuid,
	"lines" jsonb NOT NULL,
	"subtotal" bigint NOT NULL,
	"tax_pct" integer DEFAULT 18 NOT NULL,
	"total" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"delivery_address" text NOT NULL,
	"delivery_by" date NOT NULL,
	"payment_terms" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"cancel_reason" text,
	"delivered_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"supplier_org_id" uuid NOT NULL,
	"buyer_org_id" uuid NOT NULL,
	"requirement_id" uuid,
	"enquiry_id" uuid,
	"lines" jsonb NOT NULL,
	"subtotal" bigint NOT NULL,
	"tax_pct" integer DEFAULT 18 NOT NULL,
	"total" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"delivery_days" integer NOT NULL,
	"valid_until" date NOT NULL,
	"terms" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"tracking_no" text NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"eta" date,
	"status" text DEFAULT 'in_transit' NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"received_lines" jsonb,
	"receipt_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sector" text NOT NULL,
	"description" text NOT NULL,
	"sku" text,
	"unit" text NOT NULL,
	"price" bigint,
	"currency" text DEFAULT 'INR' NOT NULL,
	"moq" integer DEFAULT 1 NOT NULL,
	"lead_time_days" integer DEFAULT 7 NOT NULL,
	"stock" text DEFAULT 'in_stock' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "territories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_org_id" uuid NOT NULL,
	"distributor_org_id" uuid NOT NULL,
	"region" text NOT NULL,
	"sector" text NOT NULL,
	"exclusive" boolean DEFAULT false NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"target_value" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"revoked_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"po_id" uuid NOT NULL,
	"buyer_org_id" uuid NOT NULL,
	"supplier_org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"lines" jsonb NOT NULL,
	"amount_claimed" bigint,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolution_note" text,
	"response_due_at" timestamp with time zone NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"mime" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"buyer_org_id" uuid NOT NULL,
	"supplier_org_id" uuid NOT NULL,
	"intended_supplier_org_id" uuid,
	"supplier_product_id" uuid,
	"catalog_item_id" uuid,
	"subject" text NOT NULL,
	"quantity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"buyer_org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sector" text NOT NULL,
	"description" text,
	"items" jsonb NOT NULL,
	"delivery_location" text NOT NULL,
	"region" text,
	"needed_by" date,
	"closes_at" timestamp with time zone NOT NULL,
	"invited_supplier_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"project_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enquiry_messages" ADD CONSTRAINT "enquiry_messages_enquiry_id_trade_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."trade_enquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_messages" ADD CONSTRAINT "enquiry_messages_author_org_id_organizations_id_fk" FOREIGN KEY ("author_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_messages" ADD CONSTRAINT "enquiry_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_events" ADD CONSTRAINT "po_events_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_events" ADD CONSTRAINT "po_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_events" ADD CONSTRAINT "po_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_buyer_org_id_organizations_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_material_id_project_materials_id_fk" FOREIGN KEY ("project_material_id") REFERENCES "public"."project_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_buyer_org_id_organizations_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_requirement_id_trade_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."trade_requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_enquiry_id_trade_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."trade_enquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territories" ADD CONSTRAINT "territories_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territories" ADD CONSTRAINT "territories_distributor_org_id_organizations_id_fk" FOREIGN KEY ("distributor_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territories" ADD CONSTRAINT "territories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_claims" ADD CONSTRAINT "trade_claims_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_claims" ADD CONSTRAINT "trade_claims_buyer_org_id_organizations_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_claims" ADD CONSTRAINT "trade_claims_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_claims" ADD CONSTRAINT "trade_claims_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_documents" ADD CONSTRAINT "trade_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_documents" ADD CONSTRAINT "trade_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_enquiries" ADD CONSTRAINT "trade_enquiries_buyer_org_id_organizations_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_enquiries" ADD CONSTRAINT "trade_enquiries_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_enquiries" ADD CONSTRAINT "trade_enquiries_intended_supplier_org_id_organizations_id_fk" FOREIGN KEY ("intended_supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_enquiries" ADD CONSTRAINT "trade_enquiries_supplier_product_id_supplier_products_id_fk" FOREIGN KEY ("supplier_product_id") REFERENCES "public"."supplier_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_enquiries" ADD CONSTRAINT "trade_enquiries_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_enquiries" ADD CONSTRAINT "trade_enquiries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_requirements" ADD CONSTRAINT "trade_requirements_buyer_org_id_organizations_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_requirements" ADD CONSTRAINT "trade_requirements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_requirements" ADD CONSTRAINT "trade_requirements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "po_events_po_idx" ON "po_events" USING btree ("po_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_number_uq" ON "purchase_orders" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_quotation_uq" ON "purchase_orders" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_buyer_idx" ON "purchase_orders" USING btree ("buyer_org_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_code_uq" ON "quotations" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_active_req_uq" ON "quotations" USING btree ("requirement_id","supplier_org_id") WHERE status = 'submitted' and requirement_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_po_uq" ON "shipments" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "supplier_products_supplier_idx" ON "supplier_products" USING btree ("supplier_org_id");--> statement-breakpoint
CREATE INDEX "supplier_products_sector_idx" ON "supplier_products" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "supplier_products_fts_idx" ON "supplier_products" USING gin (to_tsvector('english', "name" || ' ' || "description"));--> statement-breakpoint
CREATE INDEX "territories_lookup_idx" ON "territories" USING btree ("supplier_org_id","region","sector");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_claims_code_uq" ON "trade_claims" USING btree ("code");--> statement-breakpoint
CREATE INDEX "trade_claims_po_idx" ON "trade_claims" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "trade_documents_owner_idx" ON "trade_documents" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_enquiries_code_uq" ON "trade_enquiries" USING btree ("code");--> statement-breakpoint
CREATE INDEX "trade_enquiries_buyer_idx" ON "trade_enquiries" USING btree ("buyer_org_id");--> statement-breakpoint
CREATE INDEX "trade_enquiries_supplier_idx" ON "trade_enquiries" USING btree ("supplier_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_requirements_code_uq" ON "trade_requirements" USING btree ("code");--> statement-breakpoint
CREATE INDEX "trade_requirements_sector_idx" ON "trade_requirements" USING btree ("sector","status");--> statement-breakpoint
CREATE OR REPLACE FUNCTION po_events_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'purchase order history is append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER po_events_append_only BEFORE UPDATE OR DELETE ON po_events FOR EACH ROW EXECUTE FUNCTION po_events_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION purchase_orders_issued_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.lines IS DISTINCT FROM OLD.lines OR NEW.total IS DISTINCT FROM OLD.total OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.supplier_org_id IS DISTINCT FROM OLD.supplier_org_id OR NEW.buyer_org_id IS DISTINCT FROM OLD.buyer_org_id) THEN
    RAISE EXCEPTION 'purchase order % has been issued; lines, totals and parties are locked', OLD.number USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER purchase_orders_issued_locked BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION purchase_orders_issued_guard();
