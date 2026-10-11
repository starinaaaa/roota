-- Supabase schedules the HTTPS call; this does not require frequent Vercel Cron jobs.
create extension if not exists pg_net with schema extensions;
create function public.configure_roota_shipment_sync(p_secret text)
returns bigint language plpgsql security definer set search_path='' as $$
declare secret_id uuid; job_id bigint;
begin
 if p_secret is null or length(p_secret)<32 then raise exception 'INVALID_CRON_SECRET'; end if;
 select id into secret_id from vault.secrets where name='roota_order_sync_cron_secret';
 if secret_id is null then
  perform vault.create_secret(p_secret,'roota_order_sync_cron_secret','Roota shipment sync endpoint');
 else
  perform vault.update_secret(secret_id,p_secret);
 end if;
 select cron.schedule('roota-order-shipment-sync','*/15 * * * *',$job$
  select net.http_get(
   url:='https://roota-liart.vercel.app/api/cron/order-shipments',
   headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='roota_order_sync_cron_secret')),
   timeout_milliseconds:=240000
  );
 $job$) into job_id;
 return job_id;
end $$;
revoke all on function public.configure_roota_shipment_sync(text) from public,anon,authenticated,service_role;
-- Provision once through the database owner after deploying the authenticated endpoint.
