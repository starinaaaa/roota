begin;
-- Server-only studio records; a refund never implicitly restocks an item.
create table public.order_returns (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
 amount numeric(12,2) not null check(amount>=0),
 money_state text not null default 'none' check(money_state in ('none','sending','processing','finished','rejected','unknown','canceled')),
 goods_state text not null default 'not_required' check(goods_state in ('not_required','expected','received')),
 provider_request_id uuid unique, notes text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.order_returns enable row level security;
revoke all on public.order_returns from public,anon,authenticated;
grant select,insert,update on public.order_returns to service_role;
create function public.save_order_return(p_order uuid,p_goods text,p_note text,p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.orders; r public.order_returns;
begin
 if p_goods is null or p_goods not in ('not_required','expected','received') or coalesce(length(trim(p_note)),0) not between 5 and 2000 or p_actor is null then raise exception 'INVALID_RETURN'; end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_MISSING'; end if;
 insert into public.order_returns(order_id,amount,goods_state,notes)
 values(p_order,o.total_amount,p_goods,trim(p_note))
 on conflict(order_id) do update set goods_state=excluded.goods_state,notes=excluded.notes,updated_at=now()
 returning * into r;
 insert into public.order_events(order_id,kind,new_value,reason,actor_id)
 values(p_order,'notes',p_goods,'Возврат: '||trim(p_note),p_actor);
end $$;
create function public.claim_order_refund(p_order uuid,p_actor uuid)
returns public.order_returns language plpgsql security invoker set search_path='' as $$
declare o public.orders; r public.order_returns; p public.payments;
begin
 select * into o from public.orders where id=p_order for update;
 select * into p from public.payments where order_id=p_order and mode='live' and status='paid';
 if not found or o.payment_status::text<>'paid' or p_actor is null then raise exception 'PAYMENT_NOT_PAID'; end if;
 update public.order_returns set money_state='sending',amount=p.amount,updated_at=now()
 where order_id=p_order and money_state in ('none','rejected','canceled') and provider_request_id is null returning * into r;
 if not found then raise exception 'REFUND_ALREADY_STARTED'; end if;
 insert into public.order_events(order_id,kind,reason,actor_id) values(p_order,'notes','Запрошен полный возврат Robokassa',p_actor);
 return r;
end $$;
create function public.set_order_refund_state(p_order uuid,p_state text,p_request uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.order_returns;
begin
 if p_state is null or p_state not in ('processing','finished','rejected','unknown','canceled') then raise exception 'INVALID_RETURN'; end if;
 perform 1 from public.orders where id=p_order for update;
 select * into r from public.order_returns where order_id=p_order for update;
 if not found or r.money_state in ('finished','canceled') then return; end if;
 if p_state in ('processing','finished','canceled') and p_request is null then raise exception 'REQUEST_REQUIRED'; end if;
 if r.provider_request_id is not null and r.provider_request_id is distinct from p_request then raise exception 'REQUEST_MISMATCH'; end if;
 update public.order_returns set money_state=p_state,provider_request_id=coalesce(p_request,provider_request_id),updated_at=now() where id=r.id;
 if p_state='finished' then
  update public.orders set payment_status='refunded' where id=p_order and payment_status::text='paid';
 end if;
 if r.money_state is distinct from p_state then
  insert into public.order_events(order_id,kind,new_value,reason) values(p_order,'notes',p_state,'Robokassa: возврат '||p_state);
 end if;
end $$;
create function public.attach_order_refund(p_order uuid,p_request uuid,p_actor uuid,p_note text)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.order_returns;
begin
 if p_request is null or p_actor is null or coalesce(length(trim(p_note)),0) not between 5 and 2000 then raise exception 'INVALID_RETURN'; end if;
 perform 1 from public.orders where id=p_order for update;
 select * into r from public.order_returns where order_id=p_order for update;
 if not found or r.provider_request_id is not null or r.money_state not in ('none','unknown','sending','rejected') then raise exception 'REFUND_ALREADY_STARTED'; end if;
 if not exists(select 1 from public.payments where order_id=p_order and status='paid' and mode='live' and amount=r.amount) then raise exception 'PAYMENT_NOT_PAID'; end if;
 update public.order_returns set provider_request_id=p_request,money_state='processing',updated_at=now() where id=r.id;
 insert into public.order_events(order_id,kind,reason,actor_id) values(p_order,'notes','Ручная сверка заявки Robokassa '||p_request||': '||trim(p_note),p_actor);
end $$;
-- Anonymous funnel sessions use a one-way hash, never the cart access cookie itself.
create table public.funnel_sessions (
 id text primary key, source text not null default '', medium text not null default '', campaign text not null default '', attribution_captured boolean not null default false,
 created_at timestamptz not null default now(), check(length(source)<=80 and length(medium)<=80 and length(campaign)<=80)
);
create table public.funnel_events (
 id bigint generated always as identity primary key,
 session_id text not null references public.funnel_sessions(id) on delete cascade,
 kind text not null check(kind in ('page_view','add_to_cart','checkout_started','order_created','paid','checkout_error')),
 detail text not null default '' check(length(detail)<=180),
 order_id uuid references public.orders(id), created_at timestamptz not null default now()
);
create index funnel_events_session_time on public.funnel_events(session_id,created_at);
create index funnel_events_time_kind on public.funnel_events(created_at,kind);
create unique index funnel_events_order_kind on public.funnel_events(order_id,kind) where order_id is not null;
create index funnel_sessions_time on public.funnel_sessions(created_at);
alter table public.funnel_sessions enable row level security;
alter table public.funnel_events enable row level security;
revoke all on public.funnel_sessions,public.funnel_events from public,anon,authenticated;
grant select,insert,update,delete on public.funnel_sessions,public.funnel_events to service_role;
grant usage,select on sequence public.funnel_events_id_seq to service_role;
create function public.record_funnel_event(p_session text,p_kind text,p_detail text default '',p_source text default '',p_medium text default '',p_campaign text default '')
returns void language plpgsql security invoker set search_path='' as $$
declare sid text;
begin
 if p_session is null or p_session !~ '^[a-f0-9-]{36}$' or p_kind is null or p_kind not in ('page_view','add_to_cart','checkout_started','checkout_error') then return; end if;
 sid:=md5(p_session);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sid,1));
 insert into public.funnel_sessions(id,source,medium,campaign,attribution_captured)
 values(sid,left(p_source,80),left(p_medium,80),left(p_campaign,80),p_kind in ('page_view','checkout_started'))
 on conflict(id) do update set source=excluded.source,medium=excluded.medium,campaign=excluded.campaign,attribution_captured=true
 where not funnel_sessions.attribution_captured and excluded.attribution_captured;
 if (select count(*) from public.funnel_events where session_id=sid and created_at>now()-interval '1 day')>=300 then return; end if;
 if p_kind in ('page_view','checkout_started') and exists(select 1 from public.funnel_events where session_id=sid and kind=p_kind and detail=left(p_detail,180) and created_at>now()-interval '1 minute') then return; end if;
 insert into public.funnel_events(session_id,kind,detail) values(sid,p_kind,left(p_detail,180));
 -- Opportunistic bounded retention, indexed by creation time; no separate scheduler.
 delete from public.funnel_sessions where id in (select id from public.funnel_sessions where created_at<now()-interval '90 days' limit 100);
end $$;
create function public.record_order_funnel() returns trigger language plpgsql security invoker set search_path='' as $$
declare s text; oid uuid; k text;
begin
 if tg_table_name='orders' then
  s:=new.cart_session; oid:=new.id; k:='order_created';
 else
  if new.mode<>'live' or new.status<>'paid' or old.status='paid' then return new; end if;
  s:=new.cart_session; oid:=new.order_id; k:='paid';
 end if;
 if s is null then return new; end if;
 insert into public.funnel_sessions(id) values(md5(s)) on conflict do nothing;
 insert into public.funnel_events(session_id,kind,order_id) values(md5(s),k,oid) on conflict do nothing;
 return new;
end $$;
create trigger order_funnel_created after insert on public.orders for each row execute function public.record_order_funnel();
create trigger order_funnel_paid after update of status on public.payments for each row execute function public.record_order_funnel();
create function public.funnel_report(p_days integer default 30) returns jsonb language sql security invoker set search_path='' as $$
 with cohort as (
 select s.id,s.source,s.medium,s.campaign,min(e.created_at) as viewed
 from public.funnel_sessions s join public.funnel_events e on e.session_id=s.id and e.kind='page_view'
 where e.created_at>=now()-make_interval(days=>least(greatest(p_days,1),90)) group by s.id
 ), stages as (
 select c.*,a.t as added,b.t as checkout,d.t as ordered,p.t as paid
 from cohort c
 left join lateral(select min(created_at) t from public.funnel_events where session_id=c.id and kind='add_to_cart' and created_at>=c.viewed) a on true
 left join lateral(select min(created_at) t from public.funnel_events where session_id=c.id and kind='checkout_started' and created_at>=a.t) b on true
 left join lateral(select min(created_at) t from public.funnel_events where session_id=c.id and kind='order_created' and created_at>=b.t) d on true
 left join lateral(select min(created_at) t from public.funnel_events where session_id=c.id and kind='paid' and created_at>=d.t) p on true
 ), totals as (select count(*) views,count(added) carts,count(checkout) checkouts,count(ordered) orders,count(paid) payments from stages),
 sources as (select source,medium,campaign,count(*) views,count(added) carts,count(checkout) checkouts,count(ordered) orders,count(paid) payments from stages group by source,medium,campaign order by count(*) desc limit 50),
 errors as (select detail,count(*) total from public.funnel_events where kind='checkout_error' and created_at>=now()-make_interval(days=>least(greatest(p_days,1),90)) group by detail)
 select jsonb_build_object('totals',(select to_jsonb(t) from totals t),'sources',coalesce((select jsonb_agg(to_jsonb(s)) from sources s),'[]'::jsonb),'errors',coalesce((select jsonb_agg(to_jsonb(e)) from errors e),'[]'::jsonb));
$$;
-- Preserve hard-bounce/complaint blocks when a later marketing opt-out arrives.
create function public.block_email_recipient(p_email text,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_reason not in ('bounced','complained','marketing_unsubscribed') then raise exception 'INVALID_BLOCK'; end if;
 insert into public.email_blocks(email,reason) values(p_email,p_reason) on conflict(email) do update set reason=case when email_blocks.reason='complained' or excluded.reason='complained' then 'complained' when email_blocks.reason='bounced' or excluded.reason='bounced' then 'bounced' else excluded.reason end;
end $$;
revoke all on function public.attach_order_refund(uuid,uuid,uuid,text),public.save_order_return(uuid,text,text,uuid),public.claim_order_refund(uuid,uuid),public.set_order_refund_state(uuid,text,uuid),public.record_funnel_event(text,text,text,text,text,text),public.record_order_funnel(),public.funnel_report(integer),public.block_email_recipient(text,text) from public,anon,authenticated;
grant execute on function public.attach_order_refund(uuid,uuid,uuid,text),public.save_order_return(uuid,text,text,uuid),public.claim_order_refund(uuid,uuid),public.set_order_refund_state(uuid,text,uuid),public.record_funnel_event(text,text,text,text,text,text),public.record_order_funnel(),public.funnel_report(integer),public.block_email_recipient(text,text) to service_role;
commit;
