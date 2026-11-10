ALTER TABLE "contract_signatures" ADD COLUMN "method" text DEFAULT 'typed' NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD COLUMN "evidence_key" text;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD COLUMN "evidence_sha256" text;