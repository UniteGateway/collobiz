CREATE TABLE "energy_introductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"from_org_id" uuid NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"stage" integer DEFAULT 0 NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"side" text NOT NULL,
	"category" text NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"district" text NOT NULL,
	"source" text NOT NULL,
	"stage" text,
	"capacity_mw" double precision NOT NULL,
	"available_mw" double precision,
	"tariff_rs_kwh" double precision,
	"target_rs_kwh" double precision,
	"ppa_years" integer,
	"models" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text NOT NULL,
	"private" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidential" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"moderation_note" text,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "energy_listings_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "energy_traders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"licence_no" text NOT NULL,
	"authority" text NOT NULL,
	"state" text,
	"category" text NOT NULL,
	"valid_until" text NOT NULL,
	"website" text,
	"verified" boolean DEFAULT false NOT NULL,
	"checked_by" uuid,
	"checked_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "energy_introductions" ADD CONSTRAINT "energy_introductions_listing_id_energy_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."energy_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_introductions" ADD CONSTRAINT "energy_introductions_from_org_id_organizations_id_fk" FOREIGN KEY ("from_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_introductions" ADD CONSTRAINT "energy_introductions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_introductions" ADD CONSTRAINT "energy_introductions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_listings" ADD CONSTRAINT "energy_listings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_listings" ADD CONSTRAINT "energy_listings_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_listings" ADD CONSTRAINT "energy_listings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_traders" ADD CONSTRAINT "energy_traders_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_traders" ADD CONSTRAINT "energy_traders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "energy_intro_uq" ON "energy_introductions" USING btree ("listing_id","from_org_id");--> statement-breakpoint
CREATE INDEX "energy_intro_from_idx" ON "energy_introductions" USING btree ("from_org_id");--> statement-breakpoint
CREATE INDEX "energy_listings_status_idx" ON "energy_listings" USING btree ("status","side");--> statement-breakpoint
CREATE INDEX "energy_listings_state_idx" ON "energy_listings" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "energy_traders_licence_uq" ON "energy_traders" USING btree ("authority","licence_no");