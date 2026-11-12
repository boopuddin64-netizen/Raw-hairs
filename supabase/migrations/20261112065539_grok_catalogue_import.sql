-- RAW HAIRS: import the approved catalogue (22 products, 6 services) and add the
-- catalogue fields the storefront and admin product manager need.
-- Additive and idempotent: safe to re-run.

-- 1) Catalogue fields ---------------------------------------------------------
alter table public.products
  add column if not exists weight_grams integer check (weight_grams is null or weight_grams > 0),
  add column if not exists base_length integer not null default 16 check (base_length > 0),
  add column if not exists length_options integer[] not null default '{12,14,16,18,20,22,24,26}',
  add column if not exists lace_options text[] not null default '{}',
  add column if not exists hair_type text;

-- 2) Product image bucket: public read, owner-only write, size/type limits -----
update storage.buckets
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'product-images';

-- 3) Products -------------------------------------------------------------------
-- image_path starting with "/" is a static file shipped in /public (e.g. /catalogue/bone.jpg).
-- Images uploaded from the admin panel are stored in the product-images bucket instead.
-- stock = 5 is a placeholder where the studio count was not published: adjust in Admin.
with seed (idx, name, slug, category, price, stock, weight_grams, description, image_path, lace_options) as (
  values
  (1,  'Bone Straight Bundle',         'bone-bundle',    'Bone Straight', 95000,  10, 100, 'Pure raw Vietnamese bone straight. Single 100g bundle. Silky, heavy, and made to be styled straight for weeks.', '/catalogue/bone.jpg', '{}'::text[]),
  (2,  'Bone Straight Deal · 3 bundles','bone-deal',     'Bone Straight', 255000, 5,  300, 'Three 100g raw Vietnamese bone straight bundles.', '/catalogue/bone.jpg', '{}'),
  (3,  'Body Wave Bundle',             'body-bundle',    'Body Wave',     98000,  5,  100, 'Raw Vietnamese body wave. Single 100g bundle.', '/catalogue/body.jpg', '{}'),
  (4,  'Deep Wave Bundle',             'deep-bundle',    'Deep Wave',     105000, 5,  100, 'Raw Vietnamese deep wave. Single 100g bundle.', '/catalogue/deep.jpg', '{}'),
  (5,  'Curly Bundle',                 'curl-bundle',    'Curly',         112000, 5,  100, 'Raw Vietnamese curly hair. Single 100g bundle.', '/catalogue/curl.jpg', '{}'),
  (6,  '13×4 HD Frontal',              'hd-frontal',     'Lace',          78000,  6,  80,  'Bone straight HD lace frontal. Transparent hairline, ear-to-ear parting room.', '/catalogue/frontal.jpg', '{}'),
  (7,  '5×5 HD Closure',               'hd-closure',     'Lace',          45000,  5,  45,  '5×5 HD lace closure in raw Vietnamese hair.', '/catalogue/closure.jpg', '{}'),
  (8,  'Body Wave HD Frontal',         'body-frontal',   'Lace',          84000,  5,  80,  'Body wave HD lace frontal in raw Vietnamese hair.', '/catalogue/body.jpg', '{}'),
  (9,  'Glueless Bone Straight Unit',  'straight-unit',  'Ready units',   185000, 3,  200, 'Ready glueless bone straight unit in raw Vietnamese hair. Choose frontal or 5×5, then the length. Made to wear without heavy adhesive.', '/catalogue/unit.jpg', '{"13×4 HD frontal","5×5 HD closure"}'),
  (10, 'Body Wave Frontal Unit',       'body-unit',      'Ready units',   198000, 5,  220, 'Ready body wave unit in raw Vietnamese hair. Choose frontal or 5×5, then the length.', '/catalogue/body.jpg', '{"13×4 HD frontal","5×5 HD closure"}'),
  (11, 'Deep Wave Unit',               'deep-unit',      'Ready units',   210000, 2,  220, 'Ready deep wave unit in raw Vietnamese hair. Choose frontal or 5×5, then the length.', '/catalogue/deep.jpg', '{"13×4 HD frontal","5×5 HD closure"}'),
  (12, 'Double Drawn Bone Straight',   'bone-double',    'Bone Straight', 128000, 5,  100, 'Double drawn raw Vietnamese bone straight. Single 100g bundle.', '/catalogue/bone.jpg', '{}'),
  (13, 'Loose Wave Bundle',            'loose-bundle',   'Loose Wave',    100000, 5,  100, 'Raw Vietnamese loose wave. Single 100g bundle.', '/catalogue/loose.jpg', '{}'),
  (14, 'Body Wave Deal · 3 bundles',   'body-deal',      'Body Wave',     268000, 5,  300, 'Three 100g raw Vietnamese body wave bundles.', '/catalogue/body.jpg', '{}'),
  (15, 'Water Wave Bundle',            'water-bundle',   'Water Wave',    108000, 5,  100, 'Raw Vietnamese water wave. Single 100g bundle.', '/catalogue/water.jpg', '{}'),
  (16, 'Honey Blonde Bone Straight',   'honey-bundle',   'Colored',       118000, 5,  100, 'Honey blonde bone straight in raw Vietnamese hair. Single 100g bundle.', '/catalogue/honey.jpg', '{}'),
  (17, 'Caramel Body Wave',            'caramel-bundle', 'Colored',       122000, 5,  100, 'Caramel body wave in raw Vietnamese hair. Single 100g bundle.', '/catalogue/caramel.jpg', '{}'),
  (18, '13×6 HD Frontal',              'hd-13x6',        'Lace',          92000,  5,  90,  '13×6 HD lace frontal in raw Vietnamese hair.', '/catalogue/frontal.jpg', '{}'),
  (19, 'Curly HD Frontal',             'curl-frontal',   'Lace',          88000,  5,  80,  'Curly HD lace frontal in raw Vietnamese hair.', '/catalogue/curl.jpg', '{}'),
  (20, 'Raw Blunt Bob',                'bob-unit',       'Ready units',   148000, 5,  160, 'Ready blunt bob unit in raw Vietnamese hair. Choose frontal or 5×5, then the length.', '/catalogue/bob-unit.jpg', '{"13×4 HD frontal","5×5 HD closure"}'),
  (21, 'Water Wave Unit',              'water-unit',     'Ready units',   205000, 2,  220, 'Ready water wave unit in raw Vietnamese hair. Choose frontal or 5×5, then the length.', '/catalogue/water.jpg', '{"13×4 HD frontal","5×5 HD closure"}'),
  (22, 'Loose Wave Frontal Unit',      'loose-unit',     'Ready units',   192000, 5,  210, 'Ready loose wave frontal unit in raw Vietnamese hair. Choose frontal or 5×5, then the length.', '/catalogue/loose.jpg', '{"13×4 HD frontal","5×5 HD closure"}')
)
insert into public.products
  (name, slug, category, price, stock, weight_grams, description, image_path, lace_options, hair_type, base_length, is_active, created_at)
select name, slug, category, price, stock, weight_grams, description, image_path, lace_options,
       'Raw Vietnamese', 16, true, now() - (idx * interval '1 minute')
from seed
on conflict (slug) do nothing;

-- 4) Services -------------------------------------------------------------------
insert into public.services (name, description, price, duration_minutes, is_active)
select v.name, v.description, v.price, v.duration_minutes, true
from (values
  ('Wig install',            'Melt, baby hairs and a secure install at the Artillery studio, on a unit you already own.', 15000, 90),
  ('Revamp and restyle',     'Wash, condition, detangle and restyle a tired unit.', 12000, 75),
  ('Hairline customization', 'Pluck, tint and shape the lace so the hairline disappears.', 18000, 120),
  ('Colour and highlights',  'Honey, caramel or a deeper tone. We confirm the process before we start.', 25000, 150),
  ('Glueless fitting',       'Cut and fit a unit so it holds without heavy adhesive.', 10000, 60),
  ('Custom unit consult',    'Texture, length, grams and density planned with you before the unit is made.', 5000, 40)
) as v(name, description, price, duration_minutes)
where not exists (select 1 from public.services s where s.name = v.name);
