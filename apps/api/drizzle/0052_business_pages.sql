ALTER TABLE "enquiries" ADD COLUMN "venture_id" uuid;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "city" text;--> statement-breakpoint
CREATE INDEX "enquiries_venture_idx" ON "enquiries" USING btree ("venture_id");