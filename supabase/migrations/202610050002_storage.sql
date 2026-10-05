begin;
-- Existing files are preserved. New uploads are private until publication.
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='products';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-drafts','product-drafts',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- A restrictive policy also constrains any permissive policies already present.
create policy roota_uploads_server_only on storage.objects as restrictive for all to anon,authenticated
using (bucket_id not in ('products','product-drafts')) with check (bucket_id not in ('products','product-drafts'));
commit;
