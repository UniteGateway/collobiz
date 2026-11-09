CREATE TABLE "growth_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"venture_id" uuid,
	"product" text NOT NULL,
	"audience" text NOT NULL,
	"sectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"countries" text[] DEFAULT '{IN}'::text[] NOT NULL,
	"pitch" text NOT NULL,
	"call_to_action" text NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"min_score" integer DEFAULT 45 NOT NULL,
	"max_leads_per_run" integer DEFAULT 25 NOT NULL,
	"daily_send_cap" integer DEFAULT 40 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"cleared_by" uuid,
	"clearance_note" text,
	"last_run_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_agents_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "growth_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"website" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"region" text,
	"city" text,
	"sector" text NOT NULL,
	"kind" text DEFAULT 'company' NOT NULL,
	"source" text NOT NULL,
	"source_detail" text NOT NULL,
	"lawful_basis" text NOT NULL,
	"consent_evidence" text,
	"opted_out_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growth_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"run_id" uuid,
	"score" integer NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"suggested_partner_org_id" uuid,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_leads_score" CHECK ("growth_leads"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "growth_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"blocked_reason" text,
	"provider" text NOT NULL,
	"prompt_version" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"outbox_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_messages_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "growth_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"provider" text NOT NULL,
	"considered" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"drafted" integer DEFAULT 0 NOT NULL,
	"skipped" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "growth_suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growth_agents" ADD CONSTRAINT "growth_agents_venture_id_unite_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."unite_ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_agents" ADD CONSTRAINT "growth_agents_cleared_by_users_id_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_agents" ADD CONSTRAINT "growth_agents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_contacts" ADD CONSTRAINT "growth_contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_leads" ADD CONSTRAINT "growth_leads_agent_id_growth_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."growth_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_leads" ADD CONSTRAINT "growth_leads_contact_id_growth_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."growth_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_leads" ADD CONSTRAINT "growth_leads_run_id_growth_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."growth_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_leads" ADD CONSTRAINT "growth_leads_suggested_partner_org_id_organizations_id_fk" FOREIGN KEY ("suggested_partner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_leads" ADD CONSTRAINT "growth_leads_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_messages" ADD CONSTRAINT "growth_messages_lead_id_growth_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."growth_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_messages" ADD CONSTRAINT "growth_messages_agent_id_growth_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."growth_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_messages" ADD CONSTRAINT "growth_messages_contact_id_growth_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."growth_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_messages" ADD CONSTRAINT "growth_messages_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_runs" ADD CONSTRAINT "growth_runs_agent_id_growth_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."growth_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_runs" ADD CONSTRAINT "growth_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "growth_contacts_email_uq" ON "growth_contacts" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "growth_contacts_sector_idx" ON "growth_contacts" USING btree ("sector");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_leads_agent_contact_uq" ON "growth_leads" USING btree ("agent_id","contact_id");--> statement-breakpoint
CREATE INDEX "growth_messages_status_idx" ON "growth_messages" USING btree ("status");