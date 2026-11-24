CREATE TABLE "channel_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"venture_id" uuid NOT NULL,
	"role" text NOT NULL,
	"business_type" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"company" text,
	"state" text NOT NULL,
	"district" text,
	"city" text NOT NULL,
	"territory" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"match" jsonb,
	"org_id" uuid,
	"user_id" uuid,
	"status" text DEFAULT 'submitted' NOT NULL,
	"approved_territory" text,
	"decision_note" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_applications_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "venture_id" uuid;--> statement-breakpoint
ALTER TABLE "unite_ventures" ADD COLUMN "oem_partner" text;--> statement-breakpoint
ALTER TABLE "unite_ventures" ADD COLUMN "oem_status" text;--> statement-breakpoint
ALTER TABLE "unite_ventures" ADD COLUMN "oem_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_applications" ADD CONSTRAINT "channel_applications_venture_id_unite_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."unite_ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_applications" ADD CONSTRAINT "channel_applications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_applications" ADD CONSTRAINT "channel_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_applications" ADD CONSTRAINT "channel_applications_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_app_venture_idx" ON "channel_applications" USING btree ("venture_id","status");--> statement-breakpoint
CREATE INDEX "channel_app_email_idx" ON "channel_applications" USING btree ("email");--> statement-breakpoint
CREATE INDEX "channel_app_org_idx" ON "channel_applications" USING btree ("org_id");