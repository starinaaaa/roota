create or replace function public.release_expired_reservations() returns integer language plpgsql security invoker set search_path='' as $$
declare pay public.payments; o public.orders; released integer:=0;
begin
 for pay in select * from public.payments where mode='live' and status='pending' and expires_at<=now() and exists(select 1 from public.orders candidate where candidate.id=order_id and candidate.reservation_state='active' and candidate.payment_status='pending' and candidate.status::text in ('new','confirmed')) order by id for update skip locked loop
   select * into o from public.orders where id=pay.order_id for update;
   if not found or o.status::text not in ('new','confirmed') or o.payment_status<>'pending' or o.reservation_state<>'active' then continue; end if;
   perform 1 from public.products where id in(select product_id from public.order_items where order_id=o.id and purchase_mode='stock') order by id for update;
   update public.products p set stock_qty=p.stock_qty+x.qty from
     (select product_id,sum(quantity)::integer qty from public.order_items where order_id=o.id and purchase_mode='stock' group by product_id) x where p.id=x.product_id;
   update public.orders set status='cancelled',reservation_state='released' where id=o.id;
   insert into public.order_events(order_id,kind,old_value,new_value,reason) values(o.id,'status',o.status::text,'cancelled','Истёк резерв: оплата не подтверждена за 30 минут');
   released:=released+1;
 end loop;
 return released;
end $$;
revoke all on function public.release_expired_reservations() from public,anon,authenticated;
grant execute on function public.release_expired_reservations() to service_role;
