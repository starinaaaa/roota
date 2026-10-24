begin;
create table public.checkout_contact_drafts (
 cart_id uuid primary key references public.carts(id) on delete cascade,
 data jsonb not null check(jsonb_typeof(data)='object'),
 captured_at timestamptz not null,
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days'
);
create index checkout_contact_drafts_expiry on public.checkout_contact_drafts(expires_at);
revoke all on public.checkout_contact_drafts from public;
grant select,insert,update,delete on public.checkout_contact_drafts to roota_app;
create or replace function public.clean_old_carts() returns void language plpgsql set search_path='' as $$
begin
 delete from public.checkout_contact_drafts d where d.expires_at<=now() or exists(
  select 1 from public.carts c join public.orders o on o.cart_session=c.session_id
  where c.id=d.cart_id and o.created_at>=d.updated_at
 );
 delete from public.carts where updated_at<now()-interval '30 days';
end $$;
commit;
