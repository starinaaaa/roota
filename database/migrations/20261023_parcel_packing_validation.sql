-- Validate every frozen parcel rule, including the one-plate remainder.
-- Existing quotes and orders without a parcel plan remain valid.
do $$
declare fn record; definition text; anchor text := 'if not found then raise exception ''PACKING_CHANGED''; end if;';
begin
 for fn in
  select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('checkout_delivery_order','checkout_robokassa')
 loop
  definition := pg_get_functiondef(fn.oid);
  if position('INVALID_PARCEL_PACKING' in definition)>0 then continue; end if;
  if position(anchor in definition)=0 then raise exception 'PACKING_VALIDATION_ANCHOR_MISSING'; end if;
  definition := replace(definition,anchor,anchor || $validation$
  if q.packing ? 'parcels' then
   if jsonb_typeof(q.packing->'parcels') <> 'array' or jsonb_array_length(q.packing->'parcels') not between 1 and 100 then
    raise exception 'INVALID_PARCEL_PACKING';
   end if;
   -- Stable ordering matches the packing-rule editor and avoids inconsistent snapshots.
   perform 1 from public.delivery_packing_rules r
    where r.id in (select (parcel#>>'{packing,id}')::uuid from jsonb_array_elements(q.packing->'parcels') parcel)
    order by r.id for share;
   if exists (
    select 1 from jsonb_array_elements(q.packing->'parcels') parcel
    left join public.delivery_packing_rules r on r.id=(parcel#>>'{packing,id}')::uuid
    where r.id is null or not r.active or r.updated_at is distinct from (parcel#>>'{packing,updated_at}')::timestamptz
   ) then raise exception 'PACKING_CHANGED'; end if;
  end if;
$validation$);
  execute definition;
 end loop;
end $$;
