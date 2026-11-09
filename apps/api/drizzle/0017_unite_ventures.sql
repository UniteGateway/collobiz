CREATE TABLE "unite_ventures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"num" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sector" text NOT NULL,
	"tagline" text NOT NULL,
	"summary" text NOT NULL,
	"stage" text NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"open" boolean DEFAULT false NOT NULL,
	"regulated_reason" text,
	"cleared_at" timestamp with time zone,
	"cleared_by" uuid,
	"clearance_note" text,
	"group_company_org_id" uuid,
	"reward_note" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venture_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"roles" text[] NOT NULL,
	"regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "direct_offers" ADD COLUMN "venture_id" uuid;--> statement-breakpoint
ALTER TABLE "unite_ventures" ADD CONSTRAINT "unite_ventures_cleared_by_users_id_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unite_ventures" ADD CONSTRAINT "unite_ventures_group_company_org_id_organizations_id_fk" FOREIGN KEY ("group_company_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unite_ventures" ADD CONSTRAINT "unite_ventures_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_interests" ADD CONSTRAINT "venture_interests_venture_id_unite_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."unite_ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_interests" ADD CONSTRAINT "venture_interests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_interests" ADD CONSTRAINT "venture_interests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_interests" ADD CONSTRAINT "venture_interests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unite_ventures_slug_uq" ON "unite_ventures" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "venture_interests_uq" ON "venture_interests" USING btree ("venture_id","organization_id");--> statement-breakpoint
ALTER TABLE "direct_offers" ADD CONSTRAINT "direct_offers_venture_id_unite_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."unite_ventures"("id") ON DELETE no action ON UPDATE no action;