begin;

-- The storefront omits unpublished products from getCart. Remove only these
-- hidden rows at checkout so the SQL checkout sees the same visible basket.
create function public.prune_unpublished_cart_items(p_session text)
returns integer language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
  if p_session is null or p_session !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'INVALID_INPUT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
  perform 1 from public.products
    where id in (select ci.product_id from public.cart_items ci
      join public.carts c on c.id=ci.cart_id where c.session_id=p_session)
    order by id for share;
  delete from public.cart_items ci using public.carts c, public.products p
    where ci.cart_id=c.id and ci.product_id=p.id and c.session_id=p_session
      and (p.publication_status<>'published' or not p.is_active);
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.prune_unpublished_cart_items(text) from public,anon,authenticated;
grant execute on function public.prune_unpublished_cart_items(text) to service_role;

commit;
