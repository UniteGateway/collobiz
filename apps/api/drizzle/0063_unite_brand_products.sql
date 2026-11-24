-- Unite brand products (building materials and interiors), made by OEM partners and sold through channel partners.
-- OEM partner names are internal until a super admin marks them public.
INSERT INTO "unite_ventures" ("num", "slug", "name", "category", "sector", "tagline", "summary", "stage", "roles", "open", "reward_note", "oem_partner", "oem_status", "oem_public") VALUES
  (49, 'unite-cement', 'Unite Cement', 'Building Materials · Unite brand', 'construction_epc', 'Cement under the Unite brand',
   'Unite-branded cement made by an established cement manufacturer under an OEM arrangement, sold through Unite distributors, dealers, stores and franchises to builders, contractors and homeowners.',
   'concept', ARRAY['refer_customers', 'sell_products']::text[], false, 'Channel margins are set in each distributor or dealer agreement.', 'CCI', 'planned', false),
  (50, 'unite-steel', 'Unite Steel', 'Building Materials · Unite brand', 'construction_epc', 'TMT and structural steel under the Unite brand',
   'Unite-branded steel made by an established steel plant under an OEM arrangement, sold through Unite distributors and dealers to builders, contractors and fabricators.',
   'concept', ARRAY['refer_customers', 'sell_products']::text[], false, 'Channel margins are set in each distributor or dealer agreement.', 'Simhadri Steels', 'planned', false),
  (51, 'unite-ply', 'Unite Ply', 'Interiors · Unite brand', 'manufacturing', 'Plywood, blockboard and laminates under the Unite brand',
   'Unite-branded plywood and boards made by a manufacturer in Gujarat under an OEM arrangement, sold through dealers, stores and franchises to carpenters, interior designers and homeowners.',
   'concept', ARRAY['refer_customers', 'sell_products', 'supply_products']::text[], false, 'Channel margins are set in each distributor or dealer agreement.', 'To be selected (Gujarat)', 'planned', false),
  (52, 'unite-carpets', 'Unite Carpets', 'Interiors · Unite brand', 'manufacturing', 'Carpets and rugs under the Unite brand',
   'Unite-branded carpets, rugs and floor coverings made by a manufacturer in Gujarat under an OEM arrangement, for homes, hotels, offices and institutions.',
   'concept', ARRAY['refer_customers', 'sell_products', 'supply_products']::text[], false, 'Channel margins are set in each distributor or dealer agreement.', 'To be selected (Gujarat)', 'planned', false),
  (53, 'unite-furniture', 'Unite Furniture', 'Interiors · Unite brand', 'manufacturing', 'Furniture from many makers, one Unite brand',
   'Home, office and hospitality furniture made by several manufacturers to Unite specifications and sold under the Unite brand through stores, dealers and franchises.',
   'concept', ARRAY['refer_customers', 'sell_products', 'supply_products']::text[], false, 'Channel margins are set in each distributor or dealer agreement.', 'Multiple manufacturers (open to applications)', 'planned', false)
ON CONFLICT ("slug") DO NOTHING;
