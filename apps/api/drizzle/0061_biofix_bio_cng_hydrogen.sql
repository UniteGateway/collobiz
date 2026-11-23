-- Unite Biofix becomes the Bio-CNG and green hydrogen business. Only rows still carrying the original seed text change,
-- so an admin's own edits are kept.
UPDATE "unite_ventures" SET
  "category" = 'Energy · Bio-CNG & Green Hydrogen',
  "tagline" = 'Bio-CNG and green hydrogen projects',
  "summary" = 'Bio-CNG (compressed biogas) plants that turn crop residue, press mud, dung, Napier grass and organic waste into clean fuel and organic manure, and green hydrogen projects powered by renewable electricity. Partners help find feedstock, sites, buyers and EPC teams.'
WHERE "slug" = 'unite-biofix' AND "tagline" = 'Bio-CNG and waste-to-energy projects';
