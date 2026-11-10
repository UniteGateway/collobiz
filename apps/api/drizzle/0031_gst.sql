CREATE TABLE "gst_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"doc_no" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"issues" jsonb NOT NULL,
	"ready" boolean NOT NULL,
	"total_value" bigint NOT NULL,
	"irn" text,
	"ewb_no" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_profiles" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"gstin" text NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"address1" text NOT NULL,
	"address2" text,
	"city" text NOT NULL,
	"pincode" text NOT NULL,
	"state_code" text NOT NULL,
	"einvoice_applicable" boolean DEFAULT false NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gst_documents" ADD CONSTRAINT "gst_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gst_documents" ADD CONSTRAINT "gst_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gst_documents_org_idx" ON "gst_documents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "gst_documents_source_idx" ON "gst_documents" USING btree ("source_type","source_id");