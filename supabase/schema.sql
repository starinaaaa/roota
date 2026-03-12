-- ============================================================
-- Glina Studio — Supabase Schema
-- Запустить в Supabase SQL Editor или через supabase db push
-- ============================================================

-- ── Enums ───────────────────────────────────────────────────

create type order_status as enum (
  'new',
  'confirmed',
  'in_production',
  'shipped',
  'delivered',
  'cancelled'
);

create type payment_status as enum (
  'pending',
  'paid',
  'failed',
  'refunded'
);

create type delivery_type as enum (
  'moscow',
  'russia'
);

-- ── Categories ──────────────────────────────────────────────

create table categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

-- ── Products ────────────────────────────────────────────────

create table products (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references categories(id) on delete set null,
  slug         text not null unique,
  name         text not null,
  description  text,
  price        integer not null,          -- цена в рублях (целое число)
  images       text[] not null default '{}',
  in_stock     boolean not null default true,
  stock_qty    integer not null default 0,
  featured     boolean not null default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index products_category_id_idx on products(category_id);
create index products_slug_idx on products(slug);
create index products_featured_idx on products(featured) where featured = true;

-- ── Customers ───────────────────────────────────────────────

create table customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null unique,       -- E.164: +79161234567
  email       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index customers_phone_idx on customers(phone);

-- ── Carts (server-side, для будущего использования) ─────────

create table carts (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null unique,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table cart_items (
  id          uuid primary key default gen_random_uuid(),
  cart_id     uuid not null references carts(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  quantity    int  not null default 1 check (quantity > 0),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(cart_id, product_id)
);

-- ── Orders ──────────────────────────────────────────────────

create table orders (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references customers(id),
  status            order_status not null default 'new',
  total_amount      integer not null,      -- в рублях
  delivery_type     delivery_type not null,
  delivery_address  text not null,
  comment           text,
  payment_status    payment_status not null default 'pending',
  payment_provider  text,                  -- 'robokassa' | null
  payment_id        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index orders_customer_id_idx on orders(customer_id);
create index orders_status_idx on orders(status);
create index orders_created_at_idx on orders(created_at desc);

-- ── Order Items (снимок товара на момент заказа) ─────────────

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  quantity      int  not null check (quantity > 0),
  price         integer not null,          -- цена на момент заказа
  product_name  text not null,             -- денормализованный снимок
  product_slug  text,                      -- для ссылки на товар
  created_at    timestamptz default now()
);

create index order_items_order_id_idx on order_items(order_id);

-- ── Row Level Security ───────────────────────────────────────

-- Включаем RLS на всех таблицах
alter table categories  enable row level security;
alter table products    enable row level security;
alter table customers   enable row level security;
alter table carts       enable row level security;
alter table cart_items  enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;

-- Каталог: публично читаем (anon key)
create policy "categories_public_read"
  on categories for select using (true);

create policy "products_public_read"
  on products for select using (true);

-- Остальные таблицы: доступ только через service_role (Server Actions)
-- Политики не создаём — без RLS-policy service_role проходит в обход RLS автоматически.

-- ── Updated_at trigger ──────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_updated_at    before update on products    for each row execute function set_updated_at();
create trigger customers_updated_at   before update on customers   for each row execute function set_updated_at();
create trigger orders_updated_at      before update on orders      for each row execute function set_updated_at();
create trigger cart_items_updated_at  before update on cart_items  for each row execute function set_updated_at();
create trigger carts_updated_at       before update on carts       for each row execute function set_updated_at();
