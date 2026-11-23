CREATE TABLE "collab_join_profiles" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"sector" text NOT NULL,
	"intents" text[] DEFAULT '{}'::text[] NOT NULL,
	"about" text,
	"city" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collab_join_profiles" ADD CONSTRAINT "collab_join_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_join_profiles" ADD CONSTRAINT "collab_join_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;