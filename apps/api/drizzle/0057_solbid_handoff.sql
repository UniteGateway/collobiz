ALTER TABLE "solar_referrals" ADD COLUMN "solbid_ref" text;--> statement-breakpoint
ALTER TABLE "solar_referrals" ADD COLUMN "solbid_status" text;--> statement-breakpoint
ALTER TABLE "solar_referrals" ADD COLUMN "solbid_outcome" jsonb;--> statement-breakpoint
ALTER TABLE "solar_referrals" ADD COLUMN "solbid_consent_note" text;--> statement-breakpoint
ALTER TABLE "solar_referrals" ADD COLUMN "solbid_sent_at" timestamp with time zone;