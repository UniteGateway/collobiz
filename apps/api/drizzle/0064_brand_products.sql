CREATE TABLE "brand_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"subdomain" text NOT NULL,
	"venture_id" uuid,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sector" text NOT NULL,
	"tagline" text NOT NULL,
	"summary" text NOT NULL,
	"buyers" text NOT NULL,
	"roles" text[] NOT NULL,
	"strong" text[] NOT NULL,
	"good" text[] DEFAULT '{}'::text[] NOT NULL,
	"bulk" boolean DEFAULT false NOT NULL,
	"showroom" boolean DEFAULT false NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"workflow" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accent" text[] DEFAULT '{#011E48,#2E7D32}'::text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "brand_products_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
ALTER TABLE "brand_products" ADD CONSTRAINT "brand_products_venture_id_unite_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."unite_ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_products" ADD CONSTRAINT "brand_products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_products" ADD CONSTRAINT "brand_products_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The five products launched on 24 Nov 2026 move into the admin-managed table (their built-in features stay as defaults).
INSERT INTO "brand_products" ("slug", "subdomain", "venture_id", "name", "category", "sector", "tagline", "summary", "buyers", "roles", "strong", "good", "bulk", "showroom", "status", "published_at")
SELECT v.slug, x.sub, v.id, v.name, v.category, v.sector, v.tagline, v.summary, x.buyers, x.roles, x.strong, x.good, x.bulk, x.showroom, 'published', now()
FROM (VALUES
  ('unite-cement', 'cement', 'builders, contractors, developers and homeowners', ARRAY['distributor','dealer','store','franchise']::text[], ARRAY['building_materials_dealer','cement_steel_trader']::text[], ARRAY['hardware_store','contractor','real_estate_developer','logistics_warehouse','new_business']::text[], true, false),
  ('unite-steel', 'steel', 'builders, contractors, fabricators and developers', ARRAY['distributor','dealer','store','franchise']::text[], ARRAY['cement_steel_trader','building_materials_dealer']::text[], ARRAY['hardware_store','contractor','real_estate_developer','logistics_warehouse','new_business']::text[], true, false),
  ('unite-ply', 'ply', 'carpenters, interior designers, furniture makers and homeowners', ARRAY['distributor','dealer','store','franchise','manufacturer']::text[], ARRAY['timber_ply_dealer','hardware_store']::text[], ARRAY['furniture_store','interior_designer','building_materials_dealer','manufacturer','new_business']::text[], false, true),
  ('unite-carpets', 'carpets', 'homes, hotels, offices and institutions', ARRAY['distributor','dealer','store','franchise','manufacturer']::text[], ARRAY['furnishing_store','interior_designer']::text[], ARRAY['furniture_store','hotel_institution_supplier','manufacturer','new_business']::text[], false, true),
  ('unite-furniture', 'furniture', 'homes, offices, hotels, schools and developers', ARRAY['distributor','dealer','store','franchise','manufacturer']::text[], ARRAY['furniture_store','manufacturer']::text[], ARRAY['interior_designer','hotel_institution_supplier','real_estate_developer','furnishing_store','timber_ply_dealer','new_business']::text[], false, true)
) AS x(slug, sub, buyers, roles, strong, good, bulk, showroom)
JOIN "unite_ventures" v ON v.slug = x.slug
ON CONFLICT ("slug") DO NOTHING;
