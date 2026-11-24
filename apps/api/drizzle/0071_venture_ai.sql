CREATE TABLE "vai_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid,
	"opportunity_id" uuid,
	"agent" text NOT NULL,
	"instruction" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"status" text NOT NULL,
	"output" text,
	"error" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_paise" bigint DEFAULT 0 NOT NULL,
	"org_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vai_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"amount_paise" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vai_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"roles" text[] NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"countries" text[] NOT NULL,
	"locations" text,
	"capacity" text,
	"spare_capacity" text,
	"machinery" text,
	"technology" text,
	"moq" text,
	"investment_min_paise" bigint,
	"investment_max_paise" bigint,
	"certifications" text[] DEFAULT '{}'::text[] NOT NULL,
	"territories" text[] DEFAULT '{}'::text[] NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"experience" text,
	"available" boolean DEFAULT true NOT NULL,
	"contact_permission" text DEFAULT 'via_collabiz' NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vai_capabilities_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "vai_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"statement" text NOT NULL,
	"source" text,
	"source_date" date,
	"added_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vai_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"message" text,
	"investment_paise" bigint,
	"earnings_note" text,
	"risks_note" text,
	"match_percent" integer,
	"match_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invited_by" uuid,
	"responded_by" uuid,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vai_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"problem" text NOT NULL,
	"market_gap" text NOT NULL,
	"target_customers" text NOT NULL,
	"proposed_solution" text NOT NULL,
	"competitors" text,
	"technology" text,
	"manufacturing" text,
	"investment_paise" bigint,
	"margin_pct" double precision,
	"countries" text[] NOT NULL,
	"risks" text,
	"regulatory" text,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score" jsonb,
	"concept" jsonb,
	"finance" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"origin" text DEFAULT 'member' NOT NULL,
	"org_id" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vai_opportunities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "vai_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"title" text NOT NULL,
	"assignee_member_id" uuid,
	"due_on" date,
	"milestone" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"done_by" uuid,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vai_ventures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'forming' NOT NULL,
	"legal_structure" text,
	"ai_budget_paise" bigint DEFAULT 0 NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vai_ventures_code_unique" UNIQUE("code"),
	CONSTRAINT "vai_ventures_opportunity_id_unique" UNIQUE("opportunity_id")
);
--> statement-breakpoint
ALTER TABLE "vai_agent_runs" ADD CONSTRAINT "vai_agent_runs_venture_id_vai_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."vai_ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_agent_runs" ADD CONSTRAINT "vai_agent_runs_opportunity_id_vai_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."vai_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_agent_runs" ADD CONSTRAINT "vai_agent_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_agent_runs" ADD CONSTRAINT "vai_agent_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_approvals" ADD CONSTRAINT "vai_approvals_venture_id_vai_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."vai_ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_approvals" ADD CONSTRAINT "vai_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_approvals" ADD CONSTRAINT "vai_approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_capabilities" ADD CONSTRAINT "vai_capabilities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_capabilities" ADD CONSTRAINT "vai_capabilities_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_evidence" ADD CONSTRAINT "vai_evidence_opportunity_id_vai_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."vai_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_evidence" ADD CONSTRAINT "vai_evidence_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_members" ADD CONSTRAINT "vai_members_venture_id_vai_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."vai_ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_members" ADD CONSTRAINT "vai_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_members" ADD CONSTRAINT "vai_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_members" ADD CONSTRAINT "vai_members_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_opportunities" ADD CONSTRAINT "vai_opportunities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_opportunities" ADD CONSTRAINT "vai_opportunities_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_opportunities" ADD CONSTRAINT "vai_opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_tasks" ADD CONSTRAINT "vai_tasks_venture_id_vai_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."vai_ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_tasks" ADD CONSTRAINT "vai_tasks_assignee_member_id_vai_members_id_fk" FOREIGN KEY ("assignee_member_id") REFERENCES "public"."vai_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_tasks" ADD CONSTRAINT "vai_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_tasks" ADD CONSTRAINT "vai_tasks_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_ventures" ADD CONSTRAINT "vai_ventures_opportunity_id_vai_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."vai_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vai_ventures" ADD CONSTRAINT "vai_ventures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vai_runs_venture_idx" ON "vai_agent_runs" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "vai_runs_created_idx" ON "vai_agent_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "vai_appr_venture_idx" ON "vai_approvals" USING btree ("venture_id","status");--> statement-breakpoint
CREATE INDEX "vai_cap_roles_idx" ON "vai_capabilities" USING gin ("roles");--> statement-breakpoint
CREATE INDEX "vai_evid_opp_idx" ON "vai_evidence" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vai_members_role_uq" ON "vai_members" USING btree ("venture_id","org_id","role");--> statement-breakpoint
CREATE INDEX "vai_members_org_idx" ON "vai_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "vai_opp_status_idx" ON "vai_opportunities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vai_tasks_venture_idx" ON "vai_tasks" USING btree ("venture_id");