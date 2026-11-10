CREATE TABLE "channel_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"whatsapp_number" text,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"opt_in_at" timestamp with time zone,
	"opt_in_text" text,
	"kinds" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"link" text,
	"buyer" text,
	"summary" text,
	"closes_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"sector" text,
	"status" text DEFAULT 'new' NOT NULL,
	"imported_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treds_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD COLUMN "udyam_number" text;--> statement-breakpoint
ALTER TABLE "channel_preferences" ADD CONSTRAINT "channel_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_leads" ADD CONSTRAINT "tender_leads_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treds_referrals" ADD CONSTRAINT "treds_referrals_invoice_id_project_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."project_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treds_referrals" ADD CONSTRAINT "treds_referrals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treds_referrals" ADD CONSTRAINT "treds_referrals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tender_leads_ext_uq" ON "tender_leads" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "treds_referrals_invoice_uq" ON "treds_referrals" USING btree ("invoice_id","platform");