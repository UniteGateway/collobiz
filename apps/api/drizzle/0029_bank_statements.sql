CREATE TABLE "bank_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"txn_date" date NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"direction" text NOT NULL,
	"amount" bigint NOT NULL,
	"utr" text,
	"status" text DEFAULT 'unmatched' NOT NULL,
	"suggested_invoice_id" uuid,
	"match_score" integer,
	"match_reason" text,
	"receipt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"layout" text NOT NULL,
	"period_from" date,
	"period_to" date,
	"line_count" integer NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD COLUMN "statement_line_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD COLUMN "confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_bank_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_suggested_invoice_id_project_invoices_id_fk" FOREIGN KEY ("suggested_invoice_id") REFERENCES "public"."project_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_receipt_id_payment_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."payment_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_statement_lines_stmt_idx" ON "bank_statement_lines" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "bank_statement_lines_utr_idx" ON "bank_statement_lines" USING btree ("utr");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statements_hash_uq" ON "bank_statements" USING btree ("uploaded_by","file_hash");--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;