ALTER TABLE "solar_referrals" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "solar_referrals" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "solar_referrals" ADD COLUMN "bill_id" uuid;--> statement-breakpoint
ALTER TABLE "solar_referrals" ADD COLUMN "roof_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "solar_referrals" ADD COLUMN "consent_at" timestamp with time zone;