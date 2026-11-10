CREATE TABLE "xchange_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"terms_key" text NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xchange_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"terms_key" text NOT NULL,
	"note" text,
	"proposed_by_org_id" uuid NOT NULL,
	"proposed_by" uuid NOT NULL,
	"agreed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xchange_deals_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "xchange_legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_org_id" uuid NOT NULL,
	"to_org_id" uuid NOT NULL,
	"listing_id" uuid,
	"description" text NOT NULL,
	"value" bigint NOT NULL,
	"cash" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery_note" text,
	"delivered_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"dispute_reason" text
);
--> statement-breakpoint
CREATE TABLE "xchange_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"org_id" uuid NOT NULL,
	"side" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"quantity" text,
	"value" bigint NOT NULL,
	"value_basis" text NOT NULL,
	"region" text NOT NULL,
	"accepts" text[] DEFAULT '{barter}'::text[] NOT NULL,
	"available_until" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xchange_listings_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "xchange_approvals" ADD CONSTRAINT "xchange_approvals_deal_id_xchange_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."xchange_deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xchange_approvals" ADD CONSTRAINT "xchange_approvals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xchange_approvals" ADD CONSTRAINT "xchange_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xchange_deals" ADD CONSTRAINT "xchange_deals_proposed_by_org_id_organizations_id_fk" FOREIGN KEY ("proposed_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xchange_deals" ADD CONSTRAINT "xchange_deals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xchange_legs" ADD CONSTRAINT "xchange_legs_deal_id_xchange_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."xchange_deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xchange_legs" ADD CONSTRAINT "xchange_legs_from_org_id_organizations_id_fk" FOREIGN KEY ("from_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xchange_legs" ADD CONSTRAINT "xchange_legs_to_org_id_organizations_id_fk" FOREIGN KEY ("to_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xchange_legs" ADD CONSTRAINT "xchange_legs_listing_id_xchange_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."xchange_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xchange_listings" ADD CONSTRAINT "xchange_listings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xchange_listings" ADD CONSTRAINT "xchange_listings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "xchange_approvals_uq" ON "xchange_approvals" USING btree ("deal_id","org_id");--> statement-breakpoint
CREATE INDEX "xchange_legs_deal_idx" ON "xchange_legs" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "xchange_listings_match_idx" ON "xchange_listings" USING btree ("status","category","side");