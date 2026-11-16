CREATE TABLE "community_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_likes" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"body" text NOT NULL,
	"topic" text DEFAULT 'general' NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"reports" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"units" bigint NOT NULL,
	"note" text,
	"status" text DEFAULT 'interested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"location" text NOT NULL,
	"unit_label" text DEFAULT 'sq ft' NOT NULL,
	"total_units" bigint NOT NULL,
	"unit_price" bigint NOT NULL,
	"min_units" bigint DEFAULT 1 NOT NULL,
	"projected_monthly_rent" bigint NOT NULL,
	"lock_in_months" integer DEFAULT 0 NOT NULL,
	"sponsor" text NOT NULL,
	"documents_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"regulatory_status" text DEFAULT 'pending' NOT NULL,
	"clearance_reference" text,
	"cleared_by" uuid,
	"cleared_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_offers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_likes" ADD CONSTRAINT "community_likes_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_likes" ADD CONSTRAINT "community_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_interests" ADD CONSTRAINT "investment_interests_offer_id_investment_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."investment_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_interests" ADD CONSTRAINT "investment_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_interests" ADD CONSTRAINT "investment_interests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_offers" ADD CONSTRAINT "investment_offers_cleared_by_users_id_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_offers" ADD CONSTRAINT "investment_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_comments_post_idx" ON "community_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "community_posts_created_idx" ON "community_posts" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_interests_uq" ON "investment_interests" USING btree ("offer_id","user_id");