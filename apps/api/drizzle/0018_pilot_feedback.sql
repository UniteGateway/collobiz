CREATE TABLE "pilot_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"usefulness" integer NOT NULL,
	"ease" integer NOT NULL,
	"recommend" integer NOT NULL,
	"used" text[] DEFAULT '{}'::text[] NOT NULL,
	"most_valuable" text,
	"blockers" text,
	"wishlist" text,
	"continue_use" text NOT NULL,
	"contact_ok" boolean DEFAULT false NOT NULL,
	"platform" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_feedback_ranges" CHECK ("pilot_feedback"."usefulness" between 1 and 5 and "pilot_feedback"."ease" between 1 and 5 and "pilot_feedback"."recommend" between 0 and 10)
);
--> statement-breakpoint
ALTER TABLE "pilot_feedback" ADD CONSTRAINT "pilot_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_feedback" ADD CONSTRAINT "pilot_feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pilot_feedback_created_idx" ON "pilot_feedback" USING btree ("created_at");