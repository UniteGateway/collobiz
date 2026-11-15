CREATE TABLE "module_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_key" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"description" text,
	"object_key" text,
	"file_name" text,
	"mime" text,
	"size" integer,
	"sha256" text,
	"url" text,
	"visibility" text DEFAULT 'partners' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"opens" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "module_documents" ADD CONSTRAINT "module_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "module_documents_module_idx" ON "module_documents" USING btree ("module_key","status");