CREATE TABLE "collab_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"from_org_id" uuid NOT NULL,
	"to_org_id" uuid NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"decline_reason" text,
	"created_by" uuid NOT NULL,
	"responded_by" uuid,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_offers" ADD COLUMN "unite_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_offers" ADD COLUMN "unite_decision" text;--> statement-breakpoint
ALTER TABLE "business_offers" ADD COLUMN "unite_decision_note" text;--> statement-breakpoint
ALTER TABLE "business_offers" ADD COLUMN "unite_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_offers" ADD COLUMN "reminded_7_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_offers" ADD COLUMN "reminded_1_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collab_invitations" ADD CONSTRAINT "collab_invitations_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_invitations" ADD CONSTRAINT "collab_invitations_from_org_id_organizations_id_fk" FOREIGN KEY ("from_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_invitations" ADD CONSTRAINT "collab_invitations_to_org_id_organizations_id_fk" FOREIGN KEY ("to_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_invitations" ADD CONSTRAINT "collab_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_invitations" ADD CONSTRAINT "collab_invitations_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collab_invitations_uq" ON "collab_invitations" USING btree ("opportunity_id","to_org_id");--> statement-breakpoint
CREATE INDEX "collab_invitations_to_idx" ON "collab_invitations" USING btree ("to_org_id");