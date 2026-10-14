-- Preserve checkout's default created event and isolate payment acknowledgements.
alter table public.notification_outbox
  add column event text not null default 'created'
  check (event in ('created','paid'));
alter table public.notification_outbox drop constraint notification_outbox_order_id_key;
alter table public.notification_outbox add constraint notification_outbox_order_event_key unique(order_id,event);

create function public.claim_notification_event(p_order uuid,p_event text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare claimed uuid;
begin
  if p_event is null or p_event not in ('created','paid') then return null; end if;
  insert into public.notification_outbox(order_id,event)
    select id,p_event from public.orders
    where id=p_order and (p_event='created' or payment_status='paid')
    on conflict(order_id,event) do nothing;
  update public.notification_outbox set state='sending',attempts=attempts+1,updated_at=now()
    where order_id=p_order and event=p_event
      and (state in ('pending','failed') or (state='sending' and updated_at<now()-interval '5 minutes'))
    returning id into claimed;
  return claimed;
end;
$$;
revoke all on function public.claim_notification_event(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_notification_event(uuid,text) to service_role;

-- Compatibility for an older application instance during a rolling deploy.
create or replace function public.claim_notification(p_order uuid) returns uuid
language sql security invoker set search_path='' as $$
  select public.claim_notification_event(p_order,'created');
$$;
