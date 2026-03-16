-- ============================================================
-- Glina Studio — Production-ready MVP schema
-- Next.js + Supabase + future Robokassa integration
-- ============================================================

-- Extensions
create extension if not exists pgcrypto;

-- ============================================================
-- Enums
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'new',
      'confirmed',
      'in_production',
      'shipped',
      'delivered',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum (
      'pending',
      'paid',
      'failed',
      'refunded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'delivery_type') then
    create type delivery_type as enum (
      'moscow',
      'russia',
      'pickup'
    );
  end if;
end $$;

-- ============================================================
-- Utility functions
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_order_number()
returns text
language plpgsql
as $$
declare
  new_number text;
begin
  new_number := 'GL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));
  return new_number;
end;
$$;

-- ============================================================
-- Categories
-- ============================================================

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists categories_sort_order_idx on public.categories(sort_order);
create index if not exists categories_is_active_idx on public.categories(is_active);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

-- ============================================================
-- Products
-- ============================================================

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  slug text not null unique,
  sku text unique,
  name text not null,
  short_description text,
  description text,
  price integer not null,
  in_stock boolean not null default true,
  stock_qty integer not null default 0,
  featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Product detail attributes (added post-launch)
  material text,
  dimensions text,
  weight text,
  dishwasher_safe boolean,
  microwave_safe boolean,

  constraint products_price_check check (price >= 0),
  constraint products_stock_qty_check check (stock_qty >= 0)
);

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_slug_idx on public.products(slug);
create index if not exists products_featured_idx on public.products(featured) where featured = true;
create index if not exists products_is_active_idx on public.products(is_active);
create index if not exists products_created_at_idx on public.products(created_at desc);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

-- ============================================================
-- Product images
-- ============================================================

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),

  constraint product_images_sort_order_check check (sort_order >= 0)
);

create index if not exists product_images_product_id_idx on public.product_images(product_id);
create index if not exists product_images_sort_order_idx on public.product_images(product_id, sort_order);
create unique index if not exists product_images_one_primary_per_product_idx
  on public.product_images(product_id)
  where is_primary = true;

-- ============================================================
-- Customers
-- ============================================================

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_phone_idx on public.customers(phone);
create index if not exists customers_email_idx on public.customers(email);

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

-- ============================================================
-- Carts
-- ============================================================

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists carts_session_id_idx on public.carts(session_id);

drop trigger if exists carts_set_updated_at on public.carts;
create trigger carts_set_updated_at
before update on public.carts
for each row
execute function public.set_updated_at();

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cart_items_quantity_check check (quantity > 0),
  constraint cart_items_unique unique (cart_id, product_id)
);

create index if not exists cart_items_cart_id_idx on public.cart_items(cart_id);
create index if not exists cart_items_product_id_idx on public.cart_items(product_id);

drop trigger if exists cart_items_set_updated_at on public.cart_items;
create trigger cart_items_set_updated_at
before update on public.cart_items
for each row
execute function public.set_updated_at();

-- ============================================================
-- Orders
-- ============================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default public.generate_order_number(),

  customer_id uuid references public.customers(id) on delete set null,

  customer_name text not null,
  customer_phone text not null,
  customer_email text,

  status order_status not null default 'new',
  payment_status payment_status not null default 'pending',

  total_amount integer not null,
  delivery_type delivery_type not null,
  delivery_address text,
  comment text,

  payment_provider text,
  payment_id text,
  payment_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_total_amount_check check (total_amount >= 0)
);

create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_payment_status_idx on public.orders(payment_status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_order_number_idx on public.orders(order_number);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

-- ============================================================
-- Order items
-- ============================================================

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,

  quantity integer not null,
  price integer not null,

  product_name text not null,
  product_slug text,
  product_sku text,

  created_at timestamptz not null default now(),

  constraint order_items_quantity_check check (quantity > 0),
  constraint order_items_price_check check (price >= 0)
);

create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);

-- ============================================================
-- RLS
-- ============================================================

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.customers enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Public catalog read
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read"
on public.categories
for select
using (is_active = true);

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
on public.products
for select
using (is_active = true);

drop policy if exists "product_images_public_read" on public.product_images;
create policy "product_images_public_read"
on public.product_images
for select
using (
  exists (
    select 1
    from public.products p
    where p.id = product_images.product_id
      and p.is_active = true
  )
);

-- No anon/authenticated policies for:
-- customers, carts, cart_items, orders, order_items
-- Access only through service_role on server side

-- ============================================================
-- Helpful view for frontend
-- ============================================================

create or replace view public.products_with_primary_image as
select
  p.id,
  p.category_id,
  p.slug,
  p.sku,
  p.name,
  p.short_description,
  p.description,
  p.price,
  p.in_stock,
  p.stock_qty,
  p.featured,
  p.is_active,
  p.created_at,
  p.updated_at,
  p.material,
  p.dimensions,
  p.weight,
  p.dishwasher_safe,
  p.microwave_safe,
  pi.public_url as primary_image_url,
  pi.alt_text as primary_image_alt
from public.products p
left join lateral (
  select public_url, alt_text
  from public.product_images
  where product_id = p.id
  order by is_primary desc, sort_order asc, created_at asc
  limit 1
) pi on true;

-- ============================================================
-- Список ожидания (waitlist)
-- ============================================================
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  contact     text not null,  -- email или телефон
  created_at  timestamptz not null default now()
);

create index if not exists waitlist_product_id_idx on public.waitlist(product_id);

-- ============================================================
-- Предзаказы (preorders)
-- ============================================================
create table if not exists public.preorders (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,
  phone       text not null,
  comment     text,
  status      text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at  timestamptz not null default now()
);

create index if not exists preorders_product_id_idx on public.preorders(product_id);