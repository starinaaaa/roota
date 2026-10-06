begin;
create table public.delivery_packing_rules (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 composition jsonb not null check(jsonb_typeof(composition)='array' and jsonb_array_length(composition)>0),
 weight_g integer not null check(weight_g>0), length_mm integer not null check(length_mm>0), width_mm integer not null check(width_mm>0), height_mm integer not null check(height_mm>0),
 active boolean not null default true, updated_at timestamptz not null default now()
);
create unique index packing_composition_active on public.delivery_packing_rules(composition) where active;
create trigger packing_rules_updated before update on public.delivery_packing_rules for each row execute function public.set_updated_at();
create table public.delivery_points (
 provider text not null, id bigint not null, name text not null, address text not null, active boolean not null, data jsonb not null,
 updated_at timestamptz not null default now(), primary key(provider,id)
);
create table public.delivery_sync (provider text primary key, cursor text, updated_at timestamptz not null default now());
create table public.delivery_quotes (
 id uuid primary key, cart_session text not null, phone text not null check(phone ~ '^\+7[0-9]{10}$'), city text not null, point jsonb not null,
 packing_rule_id uuid not null references public.delivery_packing_rules(id), packing_updated_at timestamptz not null, packing jsonb not null, cart_snapshot jsonb not null,
 shipment_method_id bigint not null, cutoff_at timestamptz, goods_amount integer not null check(goods_amount>0),
 delivery_amount numeric(12,2) not null check(delivery_amount>=0), insurance_amount numeric(12,2) not null check(insurance_amount>=0),
 estimated_days integer, checked_at timestamptz not null, expires_at timestamptz not null
);
create index delivery_quotes_session on public.delivery_quotes(cart_session,expires_at);
create table public.order_shipments (
 order_id uuid primary key references public.orders(id), provider text not null default 'ozon',
 idempotency_key uuid not null unique default gen_random_uuid(), request_payload jsonb,
 state text not null default 'pending' check(state in ('pending','creating','created','failed')),
 order_number text, posting_number text, carrier_status text, status_history jsonb,
 last_error text, claimed_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.orders alter column total_amount type numeric(12,2);
alter table public.orders add column delivery_amount numeric(12,2), add column insurance_amount numeric(12,2), add column delivery_details jsonb;
-- No buyer or anonymous access to quotes, contacts, packing configuration, or shipments.
alter table public.delivery_packing_rules enable row level security;
alter table public.delivery_points enable row level security;
alter table public.delivery_sync enable row level security;
alter table public.delivery_quotes enable row level security;
alter table public.order_shipments enable row level security;
revoke all on public.delivery_packing_rules,public.delivery_points,public.delivery_sync,public.delivery_quotes,public.order_shipments from public,anon,authenticated;
grant select,insert,update,delete on public.delivery_packing_rules,public.delivery_points,public.delivery_sync,public.delivery_quotes,public.order_shipments to service_role;
insert into public.delivery_packing_rules(name,composition,weight_g,length_mm,width_mm,height_mm)
 select 'Одна тарелка',jsonb_build_array(jsonb_build_object('category_id',id,'quantity',1)),500,230,230,50 from public.categories where slug='plates';
insert into public.delivery_packing_rules(name,composition,weight_g,length_mm,width_mm,height_mm)
 select 'Две тарелки',jsonb_build_array(jsonb_build_object('category_id',id,'quantity',2)),800,230,230,70 from public.categories where slug='plates';

-- Preserve the existing checkout's stock locks, snapshotting and rollback behavior.
-- The wrapper validates the server-owned quote and adds charges in the same transaction.
create function public.checkout_delivery_order(p_session text,p_key uuid,p_form jsonb,p_expected_total numeric,p_quote uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 q public.delivery_quotes; previous public.orders; live_cart jsonb; result jsonb; form jsonb; payload jsonb;
begin
 if p_session is null or p_key is null or p_quote is null or p_expected_total is null then raise exception 'INVALID_INPUT'; end if;
 payload:=jsonb_build_object('form',p_form,'expectedTotal',p_expected_total,'quoteId',p_quote);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
 select * into previous from public.orders where cart_session=p_session and request_key=p_key;
 if found then
   if previous.request_payload is distinct from payload then raise exception 'KEY_REUSED'; end if;
   return jsonb_build_object('id',previous.id,'number',previous.order_number);
 end if;
 select * into q from public.delivery_quotes where id=p_quote and cart_session=p_session for update;
 if not found or q.phone is distinct from p_form->>'phone' or q.expires_at<now() or q.checked_at<now()-interval '1 minute' then raise exception 'DELIVERY_EXPIRED'; end if;
 perform 1 from public.delivery_packing_rules where id=q.packing_rule_id and active and updated_at=q.packing_updated_at for share;
 if not found then raise exception 'PACKING_CHANGED'; end if;
 perform 1 from public.cart_items where cart_id in(select id from public.carts where session_id=p_session) order by product_id for update;
 perform 1 from public.products where id in(select product_id from public.cart_items where cart_id in(select id from public.carts where session_id=p_session)) order by id for update;
 select jsonb_agg(jsonb_build_object('product_id',p.id,'category_id',p.category_id,'quantity',ci.quantity,'price',p.price,'purchase_mode',ci.purchase_mode) order by p.id)
 into live_cart from public.cart_items ci join public.carts c on c.id=ci.cart_id join public.products p on p.id=ci.product_id where c.session_id=p_session;
 if live_cart is distinct from q.cart_snapshot then raise exception 'CART_CHANGED'; end if;
 if p_expected_total<>q.goods_amount+q.delivery_amount+q.insurance_amount then raise exception 'PRICE_CHANGED'; end if;
 if coalesce(p_form->>'phone','') !~ '^\+7[0-9]{10}$' then raise exception 'INVALID_INPUT'; end if;
 form:=p_form || jsonb_build_object('deliveryType','russia','address',q.point->>'address');
 result:=public.checkout_order(p_session,p_key,form,q.goods_amount);
 update public.orders set total_amount=p_expected_total,delivery_amount=q.delivery_amount,insurance_amount=q.insurance_amount,
 delivery_details=jsonb_build_object('provider','ozon','method','point','city',q.city,'point',q.point,'packing',q.packing,'shipment_method_id',q.shipment_method_id,'cutoff_at',q.cutoff_at,'quoted_at',q.checked_at,'estimated_days',q.estimated_days),
 request_payload=payload where id=(result->>'id')::uuid;
 insert into public.order_shipments(order_id) values((result->>'id')::uuid);
 return result;
end $$;
revoke all on function public.checkout_delivery_order(text,uuid,jsonb,numeric,uuid) from public,anon,authenticated;
grant execute on function public.checkout_delivery_order(text,uuid,jsonb,numeric,uuid) to service_role;

create function public.claim_delivery_shipment(p_order uuid,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders; s public.order_shipments;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.payment_status<>'paid' or o.status<>'confirmed' or o.delivery_details->>'provider'<>'ozon' then raise exception 'ORDER_NOT_READY'; end if;
 select * into s from public.order_shipments where order_id=p_order for update;
 if not found then raise exception 'SHIPMENT_NOT_FOUND'; end if;
 if s.state='created' then return null; end if;
 if s.state='creating' and s.claimed_at>now()-interval '2 minutes' then raise exception 'SHIPMENT_IN_PROGRESS'; end if;
 update public.order_shipments set state='creating',request_payload=coalesce(request_payload,p_payload),claimed_at=now(),updated_at=now(),last_error=null where order_id=p_order returning * into s;
 return to_jsonb(s);
end $$;
revoke all on function public.claim_delivery_shipment(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_delivery_shipment(uuid,jsonb) to service_role;
commit;
