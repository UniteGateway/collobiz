CREATE TABLE "uc_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"state" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"about" text NOT NULL,
	"meeting_schedule" text NOT NULL,
	"venue" text,
	"meets_online" boolean DEFAULT false NOT NULL,
	"exclusive_categories" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uc_chapters_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "uc_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"details" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"venue" text,
	"meeting_id" uuid,
	"created_by" uuid NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uc_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"category" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"intro" text,
	"sponsor_user_id" uuid,
	"decided_by" uuid,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uc_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"need" text NOT NULL,
	"consent" boolean NOT NULL,
	"status" text DEFAULT 'given' NOT NULL,
	"reported_value_minor" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uc_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"attended" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uc_service_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"hours" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uc_chapters" ADD CONSTRAINT "uc_chapters_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_chapters" ADD CONSTRAINT "uc_chapters_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_events" ADD CONSTRAINT "uc_events_chapter_id_uc_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."uc_chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_events" ADD CONSTRAINT "uc_events_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_events" ADD CONSTRAINT "uc_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_members" ADD CONSTRAINT "uc_members_chapter_id_uc_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."uc_chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_members" ADD CONSTRAINT "uc_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_members" ADD CONSTRAINT "uc_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_members" ADD CONSTRAINT "uc_members_sponsor_user_id_users_id_fk" FOREIGN KEY ("sponsor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_members" ADD CONSTRAINT "uc_members_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_referrals" ADD CONSTRAINT "uc_referrals_chapter_id_uc_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."uc_chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_referrals" ADD CONSTRAINT "uc_referrals_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_referrals" ADD CONSTRAINT "uc_referrals_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_rsvps" ADD CONSTRAINT "uc_rsvps_event_id_uc_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."uc_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_rsvps" ADD CONSTRAINT "uc_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_service_hours" ADD CONSTRAINT "uc_service_hours_event_id_uc_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."uc_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uc_service_hours" ADD CONSTRAINT "uc_service_hours_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uc_chapters_status_idx" ON "uc_chapters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "uc_events_chapter_idx" ON "uc_events" USING btree ("chapter_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uc_members_chapter_user_uq" ON "uc_members" USING btree ("chapter_id","user_id");--> statement-breakpoint
CREATE INDEX "uc_members_user_idx" ON "uc_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "uc_referrals_to_idx" ON "uc_referrals" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "uc_referrals_from_idx" ON "uc_referrals" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "uc_referrals_chapter_idx" ON "uc_referrals" USING btree ("chapter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uc_rsvps_event_user_uq" ON "uc_rsvps" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uc_service_hours_uq" ON "uc_service_hours" USING btree ("event_id","user_id");