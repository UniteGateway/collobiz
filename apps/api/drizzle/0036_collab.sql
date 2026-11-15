CREATE TABLE "business_offers" (
	"opportunity_id" uuid PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"side" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"expires_on" date NOT NULL,
	"upfront_required" boolean NOT NULL,
	"upfront_amount" bigint,
	"eligibility" text,
	"territory" text,
	"asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"unite_first_consent" boolean DEFAULT false NOT NULL,
	"unite_review_until" timestamp with time zone,
	"unite_review_org_id" uuid,
	"checks" text[] DEFAULT '{}'::text[] NOT NULL,
	"moderation_note" text,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"renewals" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collab_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"city" text,
	"region" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"capacity" double precision,
	"sectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"models" text[] DEFAULT '{}'::text[] NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"visibility" text DEFAULT 'verified_partners' NOT NULL,
	"verification" text DEFAULT 'self_declared' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collab_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"sectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"zero_upfront_only" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'verified_partners' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collab_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"from_org_id" uuid NOT NULL,
	"to_org_id" uuid NOT NULL,
	"terms" jsonb NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"contract_id" uuid,
	"created_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "collab_proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "business_offers" ADD CONSTRAINT "business_offers_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_offers" ADD CONSTRAINT "business_offers_unite_review_org_id_organizations_id_fk" FOREIGN KEY ("unite_review_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_offers" ADD CONSTRAINT "business_offers_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_assets" ADD CONSTRAINT "collab_assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_assets" ADD CONSTRAINT "collab_assets_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_assets" ADD CONSTRAINT "collab_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_needs" ADD CONSTRAINT "collab_needs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_needs" ADD CONSTRAINT "collab_needs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_proposals" ADD CONSTRAINT "collab_proposals_application_id_opportunity_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."opportunity_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_proposals" ADD CONSTRAINT "collab_proposals_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_proposals" ADD CONSTRAINT "collab_proposals_from_org_id_organizations_id_fk" FOREIGN KEY ("from_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_proposals" ADD CONSTRAINT "collab_proposals_to_org_id_organizations_id_fk" FOREIGN KEY ("to_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_proposals" ADD CONSTRAINT "collab_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_proposals" ADD CONSTRAINT "collab_proposals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_offers_status_idx" ON "business_offers" USING btree ("status","expires_on");--> statement-breakpoint
CREATE INDEX "business_offers_category_idx" ON "business_offers" USING btree ("category");--> statement-breakpoint
CREATE INDEX "collab_assets_org_idx" ON "collab_assets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "collab_assets_kind_idx" ON "collab_assets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "collab_needs_org_idx" ON "collab_needs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collab_proposals_round_uq" ON "collab_proposals" USING btree ("application_id","round");--> statement-breakpoint
CREATE INDEX "collab_proposals_opp_idx" ON "collab_proposals" USING btree ("opportunity_id");