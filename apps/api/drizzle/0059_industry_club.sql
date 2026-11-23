CREATE TABLE "club_power_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"org_id" uuid NOT NULL,
	"need" text NOT NULL,
	"sanctioned_load_kw" double precision,
	"monthly_units" integer,
	"monthly_bill" bigint,
	"state" text NOT NULL,
	"city" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'new' NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_power_requests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "club_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sector" text NOT NULL,
	"description" text NOT NULL,
	"brand_option" text NOT NULL,
	"power_free" boolean DEFAULT false NOT NULL,
	"power_offer" text,
	"certifications" text[] DEFAULT '{}'::text[] NOT NULL,
	"monthly_capacity" integer,
	"unit" text,
	"mrp" bigint,
	"status" text DEFAULT 'draft' NOT NULL,
	"checks" text[] DEFAULT '{}'::text[] NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"catalog_item_id" uuid,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "collab_join_profiles" ADD COLUMN "microsite_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "collab_join_profiles" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "club_power_requests" ADD CONSTRAINT "club_power_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_power_requests" ADD CONSTRAINT "club_power_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_products" ADD CONSTRAINT "club_products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_products" ADD CONSTRAINT "club_products_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_products" ADD CONSTRAINT "club_products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_power_org_idx" ON "club_power_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "club_products_org_idx" ON "club_products" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "club_products_status_idx" ON "club_products" USING btree ("status");--> statement-breakpoint
ALTER TABLE "collab_join_profiles" ADD CONSTRAINT "collab_join_profiles_slug_unique" UNIQUE("slug");