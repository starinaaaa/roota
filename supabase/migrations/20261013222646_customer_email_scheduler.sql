begin;
-- Reuse the already provisioned secret shared with Timeweb. It is never stored in the job text.
do $$ begin
 if not exists(select 1 from vault.secrets where name='roota_order_sync_cron_secret') then raise exception 'ROOTA_CRON_SECRET_NOT_CONFIGURED'; end if;
end $$;
select cron.schedule('roota-customer-emails','* * * * *',$job$
 select net.http_get(
  url:='https://roota.moscow/api/cron/customer-emails',
  headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='roota_order_sync_cron_secret')),
  timeout_milliseconds:=240000
 );
$job$);
commit;
