CREATE TABLE "org_subscriptions" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"plan_code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"requested_plan" text,
	"requested_cycle" text,
	"requested_by" uuid,
	"requested_at" timestamp with time zone,
	"cycle" text,
	"period_end" date,
	"payment_reference" text,
	"activated_by" uuid,
	"activated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_plans" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_monthly" bigint,
	"price_yearly" bigint,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort" bigint DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_plan_code_platform_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."platform_plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_plans" ADD CONSTRAINT "platform_plans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "platform_plans" ("code", "name", "description", "price_monthly", "price_yearly", "limits", "features", "status", "sort") VALUES
 ('free', 'Free', 'Everything you need to start: profile, opportunities, protected leads and payments tracking.', 0, 0, '{"leadsPerMonth": 10, "teamMembers": 3, "gstDocsPerMonth": 10, "importsPerMonth": 2}', '{"Protected leads with certificate","Opportunity marketplace","Project payments and receipts","Bank statement import"}', 'published', 1),
 ('growth', 'Growth', 'For active partners running several projects at once.', NULL, NULL, '{"leadsPerMonth": 50, "teamMembers": 15, "gstDocsPerMonth": 200, "importsPerMonth": 20}', '{"Everything in Free","GST e-invoice and e-way bill JSON","Tally and Excel imports","Consortium MoU and contribution ledger"}', 'draft', 2),
 ('pro', 'Pro', 'For EPCs and distributors working across states and markets.', NULL, NULL, '{"leadsPerMonth": null, "teamMembers": 50, "gstDocsPerMonth": null, "importsPerMonth": null}', '{"Everything in Growth","Unlimited leads and GST documents","Country desks and cross-border enquiries","Priority dispute review"}', 'draft', 3)
ON CONFLICT ("code") DO NOTHING;
