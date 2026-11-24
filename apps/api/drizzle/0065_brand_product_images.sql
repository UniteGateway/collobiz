ALTER TABLE "brand_products" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "brand_products" ADD COLUMN "hero_image" text;--> statement-breakpoint
-- Sunora Paints by Unite Group ("Colours That Shine."), with its logo and the Sunora Luxe tin.
INSERT INTO "unite_ventures" ("num", "slug", "name", "category", "sector", "tagline", "summary", "stage", "roles", "open", "reward_note", "oem_status", "oem_public")
SELECT coalesce(max("num"), 0) + 1, 'sunora-paints', 'Sunora Paints', 'Paints · Unite brand', 'manufacturing', 'Colours That Shine.',
  'Sunora Paints by Unite Group — interior and exterior paints, starting with Sunora Luxe premium interior emulsion. Sold through Sunora distributors, dealers, paint stores and franchises to painters, contractors, interior designers and homeowners.',
  'concept', ARRAY['refer_customers', 'sell_products', 'supply_products']::text[], false, 'Channel margins are set in each distributor or dealer agreement.', 'planned', false
FROM "unite_ventures" WHERE NOT EXISTS (SELECT 1 FROM "unite_ventures" WHERE "slug" = 'sunora-paints');
--> statement-breakpoint
INSERT INTO "brand_products" ("slug", "subdomain", "venture_id", "name", "category", "sector", "tagline", "summary", "buyers", "roles", "strong", "good", "bulk", "showroom", "features", "workflow", "accent", "logo", "hero_image", "status", "published_at")
SELECT v.slug, 'sunora', v.id, v.name, v.category, v.sector, v.tagline, v.summary, 'painters, contractors, interior designers and homeowners',
  ARRAY['distributor', 'dealer', 'store', 'franchise', 'manufacturer']::text[], ARRAY['hardware_store', 'building_materials_dealer']::text[],
  ARRAY['interior_designer', 'contractor', 'furnishing_store', 'real_estate_developer', 'timber_ply_dealer', 'manufacturer', 'new_business']::text[], false, true,
  '[{"title":"Sunora Luxe — premium interior emulsion","text":"Rich colours, smooth finish, long lasting and low VOC, as stated on the pack. 20 L pack.","planned":false},
    {"title":"Become a Sunora dealer or store","text":"Apply online as distributor, dealer, paint store or franchise for your area.","planned":false},
    {"title":"Dealer sales CRM","text":"Approved partners track painters, contractors and site orders in COLLABIZ; buyers near you are sent to you.","planned":false},
    {"title":"Make paint for Sunora","text":"Paint manufacturers can apply to produce Sunora ranges to Unite specifications.","planned":false},
    {"title":"Shade cards and tinting","text":"Shade cards and in-store tinting for dealers.","planned":true},
    {"title":"Exterior and enamel ranges","text":"Weatherproof exterior emulsions, primers and enamels.","planned":true}]'::jsonb,
  '[{"title":"Choose your role","text":"Distributor, dealer, paint store, franchise — or manufacturer."},
    {"title":"Apply","text":"Two minutes online; the matching agent tells you how well Sunora fits your business."},
    {"title":"Unite reviews","text":"Approval with your territory."},
    {"title":"Start selling","text":"Your dealer dashboard opens and nearby buyers reach you."}]'::jsonb,
  ARRAY['#0B1F3A', '#F28C28']::text[], '/brands/sunora-paints.png', '/photos/sunora-luxe-tin.webp', 'published', now()
FROM "unite_ventures" v WHERE v.slug = 'sunora-paints'
ON CONFLICT ("slug") DO NOTHING;
