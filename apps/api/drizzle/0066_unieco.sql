-- UNIECO by Unite Group Inc. — "Everyday products, made kinder." (from the UNIECO About Us page, OEM and Private Label Catalogue 2026).
INSERT INTO "unite_ventures" ("num", "slug", "name", "category", "sector", "tagline", "summary", "stage", "roles", "open", "reward_note", "oem_status", "oem_public")
SELECT coalesce(max("num"), 0) + 1, 'unieco', 'UNIECO', 'Eco-lifestyle products · Unite Group Inc.', 'manufacturing', 'Everyday products, made kinder.',
  'UNIECO is a sustainable lifestyle brand by Unite Group Inc., USA. It turns agricultural residues such as rice husk and wheat straw, and natural materials like neem wood and cellulose, into durable products for the table, home, garden, travel, personal care, pets and wellness — with OEM manufacturing, private label, wholesale supply and customised gifting for retailers, hospitality businesses, corporates and institutions worldwide.',
  'concept', ARRAY['refer_customers', 'sell_products', 'supply_products']::text[], false, 'Channel margins are set in each distributor or dealer agreement.', 'planned', false
FROM "unite_ventures" WHERE NOT EXISTS (SELECT 1 FROM "unite_ventures" WHERE "slug" = 'unieco');
--> statement-breakpoint
INSERT INTO "brand_products" ("slug", "subdomain", "venture_id", "name", "category", "sector", "tagline", "summary", "buyers", "roles", "strong", "good", "bulk", "showroom", "features", "workflow", "accent", "logo", "hero_image", "status", "published_at")
SELECT v.slug, 'unieco', v.id, v.name, v.category, v.sector, v.tagline, v.summary, 'homes, offices, hospitals, hotels, retailers, corporates and institutions',
  ARRAY['distributor', 'dealer', 'store', 'franchise', 'manufacturer']::text[], ARRAY['furnishing_store', 'hotel_institution_supplier']::text[],
  ARRAY['furniture_store', 'interior_designer', 'hardware_store', 'real_estate_developer', 'manufacturer', 'new_business']::text[], false, true,
  '[{"title":"Better materials","text":"Rice husk, wheat straw, neem wood and cellulose — farm residue and plant fibres in place of virgin plastic.","planned":false},
    {"title":"Designed to be seen","text":"Modern colours and clean shapes that look good in any setting.","planned":false},
    {"title":"Built for daily life","text":"Light, strong and easy to clean — tableware, bottles, mugs, bowls and more.","planned":false},
    {"title":"Ready for business","text":"OEM and private label, custom colours, branded packs, wholesale and corporate gifting.","planned":false},
    {"title":"Sell UNIECO","text":"Apply online as distributor, dealer, store or franchise; buyers near you are sent to you.","planned":false},
    {"title":"Make for UNIECO","text":"Manufacturers working with plant-fibre materials can apply to produce UNIECO ranges.","planned":false}]'::jsonb,
  '[{"title":"Our mission","text":"To make sustainable everyday living accessible through thoughtfully designed, high-quality products."},
    {"title":"Our vision","text":"To be a trusted global eco-lifestyle brand that inspires responsible choices and a greener future."},
    {"title":"Apply","text":"Retailers, hospitality suppliers and corporates apply as partners or for private label."},
    {"title":"Small choices. Big impact.","text":"Every product replaces something made from virgin plastic."}]'::jsonb,
  ARRAY['#14532D', '#B45309']::text[], '/brands/unieco.png', '/photos/unieco-tableware.webp', 'published', now()
FROM "unite_ventures" v WHERE v.slug = 'unieco'
ON CONFLICT ("slug") DO NOTHING;
