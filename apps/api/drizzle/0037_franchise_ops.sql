CREATE TABLE "franchise_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"customer_name" text,
	"order_date" text NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal" bigint NOT NULL,
	"gst" bigint NOT NULL,
	"total" bigint NOT NULL,
	"status" text NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "franchise_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "franchise_royalty_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"month" text NOT NULL,
	"net_sales" bigint NOT NULL,
	"orders" integer NOT NULL,
	"royalty_bps" integer NOT NULL,
	"royalty" bigint NOT NULL,
	"gst" bigint NOT NULL,
	"total" bigint NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'due' NOT NULL,
	"invoice_number" text,
	"due_date" text,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	"dispute_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "territory" text;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "exclusive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "term_years" integer;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "notice_days" integer;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "agreement_starts" text;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "agreement_ends" text;--> statement-breakpoint
ALTER TABLE "franchise_units" ADD COLUMN "agreement_contract_id" uuid;--> statement-breakpoint
ALTER TABLE "franchise_orders" ADD CONSTRAINT "franchise_orders_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_orders" ADD CONSTRAINT "franchise_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_royalty_statements" ADD CONSTRAINT "franchise_royalty_statements_unit_id_franchise_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."franchise_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "franchise_orders_unit_idx" ON "franchise_orders" USING btree ("unit_id","kind","order_date");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_royalty_unit_month_uq" ON "franchise_royalty_statements" USING btree ("unit_id","month");