-- Observed production additions (2026-10-05); apply only to an isolated test database.
drop table public.waitlist;
create table public.waitlist(id uuid not null default gen_random_uuid(),product_id uuid,email text,telegram text,created_at timestamp with time zone default now(),notified_at timestamp with time zone);
alter table public.waitlist add constraint waitlist_contact CHECK (((email IS NOT NULL) OR (telegram IS NOT NULL)));
alter table public.waitlist add constraint waitlist_pkey PRIMARY KEY (id);
alter table public.waitlist add constraint waitlist_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.waitlist enable row level security;
drop table public.preorders;
create table public.preorders(id uuid not null default gen_random_uuid(),product_id uuid,customer_name text not null,customer_phone text not null,customer_email text,quantity integer not null default 1,status text not null default 'pending'::text,comment text,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now());
alter table public.preorders add constraint preorders_quantity_check CHECK ((quantity > 0));
alter table public.preorders add constraint preorders_pkey PRIMARY KEY (id);
alter table public.preorders add constraint preorders_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.preorders enable row level security;
CREATE OR REPLACE FUNCTION public.decrease_stock_on_order()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.products
  SET 
    stock_qty = stock_qty - NEW.quantity,
    in_stock = CASE WHEN stock_qty - NEW.quantity <= 0 THEN false ELSE true END
  WHERE id = NEW.product_id
    AND stock_qty >= NEW.quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Недостаточно товара на складе (product_id: %)', NEW.product_id;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_decrease_stock_on_order AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION decrease_stock_on_order();
CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Если статус изменился на 'cancelled'
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    UPDATE public.products p
    SET 
      stock_qty = p.stock_qty + oi.quantity,
      in_stock = true
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id = p.id;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_restore_stock_on_cancel AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION restore_stock_on_cancel();
CREATE OR REPLACE FUNCTION public.sync_in_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.stock_qty <= 0 THEN
    NEW.in_stock = false;
    NEW.stock_qty = 0;
  ELSE
    NEW.in_stock = true;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_sync_in_stock BEFORE UPDATE OF stock_qty ON public.products FOR EACH ROW EXECUTE FUNCTION sync_in_stock();
CREATE TRIGGER preorders_set_updated_at BEFORE UPDATE ON public.preorders FOR EACH ROW EXECUTE FUNCTION set_updated_at();