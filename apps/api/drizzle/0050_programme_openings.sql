CREATE TABLE "programme_openings" (
	"programme" text PRIMARY KEY NOT NULL,
	"opened_by" uuid NOT NULL,
	"approval_note" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programme_openings" ADD CONSTRAINT "programme_openings_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;