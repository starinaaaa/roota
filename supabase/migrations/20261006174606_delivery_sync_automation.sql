begin;
alter table public.delivery_sync add column completed_at timestamptz,
  add column lease_owner uuid, add column lease_until timestamptz;

create function public.claim_delivery_sync(p_owner uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare claimed boolean;
begin
  if p_owner is null then raise exception 'INVALID_OWNER'; end if;
  insert into public.delivery_sync(provider) values ('ozon') on conflict do nothing;
  update public.delivery_sync set lease_owner=p_owner, lease_until=now()+interval '5 minutes'
  where provider='ozon' and (lease_until is null or lease_until<now());
  claimed := found;
  return claimed;
end $$;
create function public.release_delivery_sync(p_owner uuid) returns void
language sql security invoker set search_path = '' as $$
  update public.delivery_sync set lease_owner=null, lease_until=null
  where provider='ozon' and lease_owner=p_owner;
$$;
revoke all on function public.claim_delivery_sync(uuid), public.release_delivery_sync(uuid) from public, anon, authenticated;
grant execute on function public.claim_delivery_sync(uuid), public.release_delivery_sync(uuid) to service_role;
commit;
