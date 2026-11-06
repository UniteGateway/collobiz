CREATE TABLE "collaboration_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"kind" text DEFAULT 'team' NOT NULL,
	"opportunity_id" uuid,
	"lead_org_id" uuid NOT NULL,
	"status" text DEFAULT 'forming' NOT NULL,
	"nda_text" text NOT NULL,
	"nda_hash" text NOT NULL,
	"activated_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" text NOT NULL,
	"responsibilities" text,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_by" uuid,
	"invite_message" text,
	"responded_at" timestamp with time zone,
	"nda_signed_at" timestamp with time zone,
	"nda_signed_by" uuid,
	"nda_typed_name" text,
	"revoked_reason" text,
	"match_score" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"author_org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"assignee_org_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"shares" jsonb NOT NULL,
	"terms" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collaboration_teams" ADD CONSTRAINT "collaboration_teams_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_teams" ADD CONSTRAINT "collaboration_teams_lead_org_id_organizations_id_fk" FOREIGN KEY ("lead_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_teams" ADD CONSTRAINT "collaboration_teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_collaboration_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."collaboration_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_nda_signed_by_users_id_fk" FOREIGN KEY ("nda_signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_team_id_collaboration_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."collaboration_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_author_org_id_organizations_id_fk" FOREIGN KEY ("author_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_assignee_org_id_organizations_id_fk" FOREIGN KEY ("assignee_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_proposals" ADD CONSTRAINT "team_proposals_team_id_collaboration_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."collaboration_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_proposals" ADD CONSTRAINT "team_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teams_code_uq" ON "collaboration_teams" USING btree ("code");--> statement-breakpoint
CREATE INDEX "teams_lead_idx" ON "collaboration_teams" USING btree ("lead_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_uq" ON "team_members" USING btree ("team_id","organization_id");--> statement-breakpoint
CREATE INDEX "team_members_org_idx" ON "team_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "team_posts_team_idx" ON "team_posts" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_proposals_ver_uq" ON "team_proposals" USING btree ("team_id","version");