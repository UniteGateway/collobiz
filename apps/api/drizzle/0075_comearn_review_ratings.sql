CREATE TABLE "ce_negotiations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"from_side" text NOT NULL,
	"proposed_rate_bps" integer,
	"proposed_fixed_paise" bigint,
	"note" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"responded_by" uuid,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ce_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"from_org_id" uuid NOT NULL,
	"to_org_id" uuid NOT NULL,
	"as_role" text NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ce_commissions" ADD COLUMN "unite_margin_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "company_rate_bps" integer;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "company_fixed_paise" bigint;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "unite_margin_bps" integer;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "unite_margin_paise" bigint;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "approved_version" integer;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "released_by" uuid;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "unite_guaranteed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD COLUMN "sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ce_negotiations" ADD CONSTRAINT "ce_negotiations_opportunity_id_ce_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."ce_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_negotiations" ADD CONSTRAINT "ce_negotiations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_negotiations" ADD CONSTRAINT "ce_negotiations_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_ratings" ADD CONSTRAINT "ce_ratings_engagement_id_ce_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."ce_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_ratings" ADD CONSTRAINT "ce_ratings_from_org_id_organizations_id_fk" FOREIGN KEY ("from_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_ratings" ADD CONSTRAINT "ce_ratings_to_org_id_organizations_id_fk" FOREIGN KEY ("to_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ce_ratings" ADD CONSTRAINT "ce_ratings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ce_neg_opp_idx" ON "ce_negotiations" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ce_ratings_eng_from_uq" ON "ce_ratings" USING btree ("engagement_id","from_org_id");--> statement-breakpoint
CREATE INDEX "ce_ratings_to_idx" ON "ce_ratings" USING btree ("to_org_id","as_role");--> statement-breakpoint
ALTER TABLE "ce_opportunities" ADD CONSTRAINT "ce_opportunities_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;