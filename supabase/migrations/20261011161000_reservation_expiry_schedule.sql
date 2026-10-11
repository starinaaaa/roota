begin;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('roota-release-expired-reservations','* * * * *','select public.release_expired_reservations()');
commit;
