ALTER TABLE "brand_products" ADD COLUMN "range" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_products" ADD COLUMN "benefits" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- UNIECO content from the Unite Group Eco-Living Catalogue 2026 (OEM and Private Label): range, Mighty Mug, benefits by audience.
-- Only categories and products named in the catalogue; no prices.
UPDATE "brand_products" SET
  "hero_image" = '/photos/unieco-tableware-range.webp',
  "range" = '[
    {"title":"01 Tableware","text":"Drinkware and dinnerware — cups, mugs, plates and bowls crafted from upcycled rice husk and wheat straw. Lightweight, colourful and made for daily use.","image":"/photos/unieco-mugs-stack.webp","items":["Cups","Mugs","Plates","Bowls"]},
    {"title":"Mighty Mug","text":"Drinkware · 400 ml · rice husk. Generous size for coffee, tea or soup; lightweight and comfortable to hold; made from upcycled farm residue, not virgin plastic; dishwasher and microwave friendly. Five colours.","image":"/photos/unieco-mighty-mug.webp","items":["400 ml","Rice husk","Dishwasher and microwave friendly","5 colours"]},
    {"title":"02 Travel","text":"Everyday products to carry with you, made from plant-fibre materials.","image":"/photos/unieco-mug-bottle.webp","items":[]},
    {"title":"03 Home and Garden","text":"Durable products for the home and garden from agricultural residue and natural materials.","image":"/photos/unieco-seedling.webp","items":[]},
    {"title":"04 Personal Care","text":"Personal care products made with natural materials such as neem wood and cellulose.","image":"/photos/unieco-rice-husk.webp","items":[]},
    {"title":"05 Pet Care","text":"Products for pets, made kinder to the planet.","image":"/photos/unieco-bowls.webp","items":[]},
    {"title":"06 Wellness and Spa","text":"A professional wellness line that completes the range.","image":"/photos/unieco-packs.webp","items":[]}
  ]'::jsonb,
  "benefits" = '[
    {"title":"For your customers","items":["Light, durable products made to last","Soft colours and modern shapes for every home","Dishwasher and microwave friendly on selected items","Simple, safe everyday use for the whole family","Thoughtful gifts people feel good giving","A practical way to cut single-use plastic"]},
    {"title":"For the planet","items":["Uses agricultural residue that would otherwise be wasted or burnt","Less virgin plastic in everyday products","Reusable design that replaces disposables","Recyclable and biodegradable options across the range","Natural materials such as neem wood and cellulose","Supports a circular, lower-waste way of living"]},
    {"title":"For retailers and cafes","items":["A fresh eco-friendly range that stands out on shelf","Wide colour choices for every display","Strong gifting and seasonal sales potential","Light, compact products that are easy to ship and stock","Repeat-purchase items such as bags, sponges and cups","Bulk orders with custom colours"]},
    {"title":"For corporates and institutions","items":["Branded drinkware and gift sets for staff and clients","Visible support for sustainability goals","Event-ready cups, plates and cutlery to replace disposables","Consistent supply for hotels, cafes and canteens","Single point of contact for large orders","Reusable items that keep your brand in daily use"]}
  ]'::jsonb,
  "workflow" = '[
    {"title":"OEM and private label","text":"Your brand on UNIECO products — custom colours and branded packs for any channel."},
    {"title":"Customisation and bulk orders","text":"Custom colours, logos and gift sets for retailers, hotels, corporates and institutions."},
    {"title":"Partner with us","text":"Apply as distributor, dealer, store or franchise; buyers near you are sent to you."},
    {"title":"MSME franchise partners","text":"Small businesses can run a UNIECO franchise; terms are set in each franchise agreement."}
  ]'::jsonb,
  "updated_at" = now()
WHERE "slug" = 'unieco';
