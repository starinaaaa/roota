alter table public.order_events drop constraint order_events_kind_check;
alter table public.order_events add constraint order_events_kind_check check(kind in ('status','payment','notes','delivery'));
alter table public.orders add column delivery_stage text check(delivery_stage in ('preparing','shipped','in_transit','ready_for_pickup','delivered','cancelled','problem'));
alter table public.order_shipments add column synced_at timestamptz;
alter table public.order_shipments add column carrier_changed_at timestamptz;
alter table public.order_shipments add column next_sync_at timestamptz not null default now();
alter table public.order_shipments add column sync_claim uuid;
create index order_shipments_next_sync on public.order_shipments(next_sync_at) where state='created';

create function public.claim_order_shipment_sync(p_limit integer default 20)
returns setof public.order_shipments language sql security invoker set search_path='' as $$
 with candidates as (
  select s.order_id from public.order_shipments s join public.orders o on o.id=s.order_id
  where s.state='created' and s.posting_number is not null and s.next_sync_at<=now()
   and o.status::text not in ('cancelled','delivered') and o.payment_status='paid'
   and coalesce(s.carrier_status,'')<>'canceled'
  order by s.next_sync_at limit least(greatest(p_limit,1),100) for update of s skip locked
 ) update public.order_shipments s set next_sync_at=now()+interval '5 minutes',sync_claim=gen_random_uuid()
 from candidates c where s.order_id=c.order_id returning s.*;
$$;

-- Saves the carrier and order together; old or overlapping responses cannot undo a newer state.
create function public.apply_order_shipment_status(p_order uuid,p_posting text,p_status text,p_changed timestamptz,p_history jsonb,p_claim uuid default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.orders; s public.order_shipments; stage text; target public.order_status;
begin
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into s from public.order_shipments where order_id=p_order for update;
 if not found or s.posting_number is distinct from p_posting then raise exception 'SHIPMENT_MISMATCH'; end if;
 if p_claim is not null and s.sync_claim is distinct from p_claim then return false; end if;
 if p_changed is null or p_changed>now()+interval '5 minutes' then raise exception 'INVALID_STATUS_DATE'; end if;
 if s.carrier_changed_at is not null and p_changed<s.carrier_changed_at then
  update public.order_shipments set next_sync_at=now()+interval '15 minutes',sync_claim=null where order_id=p_order;
  return false;
 end if;
 stage:=case p_status
  when 'created' then 'preparing' when 'forming' then 'preparing' when 'ready_for_shipping' then 'preparing' when 'in_container' then 'preparing'
  when 'acceptance_in_progress' then 'preparing' when 'on_way' then 'in_transit' when 'in_courier_service' then 'in_transit'
  when 'in_delivery_point' then 'ready_for_pickup' when 'delivered' then 'delivered'
  when 'canceled' then 'cancelled' when 'forming_failed' then 'problem' when 'not_accepted_to_delivery' then 'problem' else null end;
 update public.order_shipments set carrier_status=p_status,carrier_changed_at=p_changed,status_history=p_history,
  synced_at=now(),updated_at=now(),sync_claim=null,next_sync_at=now()+interval '15 minutes',
  last_error=case when stage is null then 'Неизвестный статус Ozon: требуется проверка.' else null end where order_id=p_order;
 if stage is null or o.status::text in ('cancelled','delivered') or o.payment_status<>'paid' then return false; end if;
 target:=case when stage='delivered' then 'delivered'::public.order_status
  when stage in ('in_transit','ready_for_pickup') then 'shipped'::public.order_status else o.status end;
 if stage is distinct from o.delivery_stage then
  insert into public.order_events(order_id,kind,old_value,new_value,reason) values(p_order,'delivery',o.delivery_stage,stage,'Ozon Delivery API');
 end if;
 if target<>o.status then
  insert into public.order_events(order_id,kind,old_value,new_value,reason) values(p_order,'status',o.status::text,target::text,'Ozon Delivery API');
 end if;
 update public.orders set delivery_stage=stage,status=target,
  tracking_number=case when coalesce(tracking_number,'')='' then p_posting else tracking_number end,
  reservation_state=case when target::text in ('shipped','delivered') and reservation_state='active' then 'fulfilled' else reservation_state end
 where id=p_order;
 return true;
end $$;
revoke all on function public.claim_order_shipment_sync(integer), public.apply_order_shipment_status(uuid,text,text,timestamptz,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.claim_order_shipment_sync(integer), public.apply_order_shipment_status(uuid,text,text,timestamptz,jsonb,uuid) to service_role;
