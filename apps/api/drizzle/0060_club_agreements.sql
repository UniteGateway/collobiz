CREATE TABLE "club_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"type" text NOT NULL,
	"template_code" text NOT NULL,
	"template_version" integer NOT NULL,
	"pilot_draft" boolean NOT NULL,
	"from_org_id" uuid NOT NULL,
	"to_org_id" uuid NOT NULL,
	"product_id" uuid,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_agreements_contract_id_unique" UNIQUE("contract_id")
);
--> statement-breakpoint
ALTER TABLE "agreement_templates" ADD COLUMN "legal_reviewed_by" text;--> statement-breakpoint
ALTER TABLE "agreement_templates" ADD COLUMN "legal_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agreement_templates" ADD COLUMN "legal_review_recorded_by" uuid;--> statement-breakpoint
ALTER TABLE "agreement_templates" ADD COLUMN "legal_review_note" text;--> statement-breakpoint
ALTER TABLE "club_products" ADD COLUMN "currency" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "club_products" ADD COLUMN "markets" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "club_products" ADD COLUMN "origin_country" text DEFAULT 'IN' NOT NULL;--> statement-breakpoint
ALTER TABLE "club_products" ADD COLUMN "contract_id" uuid;--> statement-breakpoint
ALTER TABLE "collab_join_profiles" ADD COLUMN "country" text DEFAULT 'IN' NOT NULL;--> statement-breakpoint
ALTER TABLE "collab_join_profiles" ADD COLUMN "member_code" text;--> statement-breakpoint
ALTER TABLE "club_agreements" ADD CONSTRAINT "club_agreements_from_org_id_organizations_id_fk" FOREIGN KEY ("from_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_agreements" ADD CONSTRAINT "club_agreements_to_org_id_organizations_id_fk" FOREIGN KEY ("to_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_agreements" ADD CONSTRAINT "club_agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_agreements_from_idx" ON "club_agreements" USING btree ("from_org_id");--> statement-breakpoint
CREATE INDEX "club_agreements_to_idx" ON "club_agreements" USING btree ("to_org_id");--> statement-breakpoint
ALTER TABLE "agreement_templates" ADD CONSTRAINT "agreement_templates_legal_review_recorded_by_users_id_fk" FOREIGN KEY ("legal_review_recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_join_profiles" ADD CONSTRAINT "collab_join_profiles_member_code_unique" UNIQUE("member_code");