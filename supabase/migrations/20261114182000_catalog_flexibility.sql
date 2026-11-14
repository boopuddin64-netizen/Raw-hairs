-- RAW HAIRS flexible catalogue foundation.
-- Source-only migration: review and apply to a staging database before any live rollout.
-- Existing products remain intact and are classified as Hair products; no accessory SKUs are created.

create table if not exists public.catalog_product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references public.catalog_product_types(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (product_type_id, slug)
);

create table if not exists public.catalog_attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references public.catalog_product_types(id) on delete restrict,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (length(trim(label)) between 1 and 100),
  field_type text not null default 'text' check (field_type in ('text', 'number', 'select', 'boolean')),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and octet_length(options::text) <= 4096),
  is_required boolean not null default false,
  display_in_specs boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (product_type_id, key)
);

alter table public.products
  add column if not exists product_type_id uuid references public.catalog_product_types(id) on delete restrict,
  add column if not exists category_id uuid references public.catalog_categories(id) on delete set null,
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists gallery_paths text[] not null default '{}'::text[];

-- Length belongs to hair products; accessories can legitimately have no length.
alter table public.products alter column base_length drop not null;

-- Named constraints make reruns safe and keep untrusted JSON/path arrays bounded.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_attributes_object_size_check') then
    alter table public.products add constraint products_attributes_object_size_check
      check (jsonb_typeof(attributes) = 'object' and octet_length(attributes::text) <= 8192);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_gallery_paths_count_check') then
    alter table public.products add constraint products_gallery_paths_count_check
      check (cardinality(gallery_paths) <= 7);
  end if;
end $$;

create index if not exists catalog_categories_type_active_sort_idx
  on public.catalog_categories(product_type_id, is_active, sort_order);
create index if not exists catalog_attributes_type_active_sort_idx
  on public.catalog_attribute_definitions(product_type_id, is_active, sort_order);
create index if not exists products_type_category_idx
  on public.products(product_type_id, category_id);

insert into public.catalog_product_types(name, slug, sort_order)
values ('Hair products', 'hair', 10), ('Hair accessories', 'hair-accessories', 20)
on conflict (slug) do nothing;

-- Preserve the current catalogue: all pre-existing products belong to Hair products.
insert into public.catalog_categories(product_type_id, name, slug, sort_order)
select t.id, source.category_name,
       trim(both '-' from regexp_replace(lower(source.category_name), '[^a-z0-9]+', '-', 'g')),
       row_number() over (order by source.category_name)::integer * 10
  from (
    select distinct trim(category) as category_name
      from public.products
     where category is not null and length(trim(category)) between 1 and 100
  ) as source
  cross join public.catalog_product_types as t
 where t.slug = 'hair'
   and trim(both '-' from regexp_replace(lower(source.category_name), '[^a-z0-9]+', '-', 'g')) <> ''
on conflict (product_type_id, slug) do nothing;

with product_catalog as (
  select p.id as product_id,
         coalesce(p.product_type_id, selected_type.id) as type_id,
         c.id as category_id
    from public.products as p
    cross join public.catalog_product_types as hair_type
    join public.catalog_product_types as selected_type
      on selected_type.id = coalesce(p.product_type_id, hair_type.id)
     and hair_type.slug = 'hair'
    left join public.catalog_categories as c
      on c.product_type_id = selected_type.id
     and c.slug = trim(both '-' from regexp_replace(lower(trim(p.category)), '[^a-z0-9]+', '-', 'g'))
   where p.product_type_id is null or p.category_id is null
)
update public.products as p
   set product_type_id = pc.type_id,
       category_id = coalesce(p.category_id, pc.category_id)
  from product_catalog as pc
 where p.id = pc.product_id;

create or replace function public.sync_product_catalog_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_category public.catalog_categories;
begin
  if new.category_id is not null then
    select * into v_category from public.catalog_categories where id = new.category_id;
    if not found then
      raise exception 'catalog category does not exist';
    end if;
    if new.product_type_id is null then
      new.product_type_id := v_category.product_type_id;
    elsif new.product_type_id <> v_category.product_type_id then
      raise exception 'catalog category must belong to the selected product type';
    end if;
    new.category := v_category.name;
  end if;
  return new;
end;
$$;

drop trigger if exists products_sync_catalog_category on public.products;
create trigger products_sync_catalog_category
before insert or update of product_type_id, category_id, category on public.products
for each row execute function public.sync_product_catalog_category();

create or replace function public.sync_product_category_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.products set category = new.name where category_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_category_sync_product_names on public.catalog_categories;
create trigger catalog_category_sync_product_names
after update of name on public.catalog_categories
for each row execute function public.sync_product_category_name();

alter table public.catalog_product_types enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_attribute_definitions enable row level security;
revoke all on public.catalog_product_types, public.catalog_categories, public.catalog_attribute_definitions from public, anon, authenticated;
grant select on public.catalog_product_types, public.catalog_categories, public.catalog_attribute_definitions to anon, authenticated;
grant all on public.catalog_product_types, public.catalog_categories, public.catalog_attribute_definitions to service_role;

create policy "Public reads active catalogue product types"
  on public.catalog_product_types for select to anon, authenticated using (is_active);
create policy "Public reads active catalogue categories"
  on public.catalog_categories for select to anon, authenticated using (is_active);
create policy "Public reads active catalogue attributes"
  on public.catalog_attribute_definitions for select to anon, authenticated using (is_active);

revoke insert, update, delete on public.catalog_product_types, public.catalog_categories, public.catalog_attribute_definitions
  from anon, authenticated;
