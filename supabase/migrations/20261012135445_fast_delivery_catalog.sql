-- Public carrier data only. Buyers read small projections through the server.
create function public.normalize_delivery_city(value text) returns text language sql immutable set search_path='' as $$
 select case when s in ('спб','питер','санкт петербург') then 'санкт-петербург' else s end
 from (select regexp_replace(replace(lower(trim(value)),'ё','е'),'^г(ород)?[.]?[[:space:]]+','') as s) x;
$$;
create function public.delivery_address_city(value text) returns text language plpgsql immutable set search_path='' as $$
declare part text; parts text[] := string_to_array(value,',');
begin
 foreach part in array parts loop
  part:=trim(part);
  if public.normalize_delivery_city(part)='москва' then return 'Москва'; end if;
  if public.normalize_delivery_city(part)='санкт-петербург' then return 'Санкт-Петербург'; end if;
  if part ~* '^(г(ород)?|пгт|пос(елок)?|село|деревня)[.]?[[:space:]]+' then
   return regexp_replace(part,'^(г(ород)?|пгт|пос(елок)?|село|деревня)[.]?[[:space:]]+','','i');
  end if;
 end loop;
 foreach part in array parts loop
  part:=trim(part);
  if part ~* '[а-я]' and part !~* 'россия|республика|область|обл[.]|район|край|округ|улица|ул[.]|проспект|пр-т|шоссе|переулок|дом|^д[.]' then return part; end if;
 end loop;
 return null;
end $$;
create table public.delivery_city_catalog (
 city_key text primary key, name text not null, latitude double precision not null, longitude double precision not null,
 points jsonb not null check(jsonb_typeof(points)='array'), updated_at timestamptz not null default now()
);
alter table public.delivery_city_catalog enable row level security;
revoke all on public.delivery_city_catalog from public,anon,authenticated;
grant select,insert,update,delete on public.delivery_city_catalog to service_role;
create index delivery_city_catalog_prefix on public.delivery_city_catalog(city_key text_pattern_ops);
create function public.refresh_delivery_city_catalog() returns bigint language plpgsql security invoker set search_path='' as $$
declare affected bigint; refresh_stamp timestamptz := clock_timestamp();
begin
 perform pg_advisory_xact_lock(7781314);
 with raw as materialized (
  select public.delivery_address_city(address) as city,id,name,address,
   case when jsonb_typeof(data->'coordinates'->'latitude')='number' then (data->'coordinates'->>'latitude')::float8 end as lat,
   case when jsonb_typeof(data->'coordinates'->'longitude')='number' then (data->'coordinates'->>'longitude')::float8 end as lon
  from public.delivery_points where provider='ozon' and active
 ), valid as materialized (
  select *,public.normalize_delivery_city(city) as key from raw where city is not null and lat between -90 and 90 and lon between -180 and 180 and (lat<>0 or lon<>0)
 ) insert into public.delivery_city_catalog(city_key,name,latitude,longitude,points,updated_at)
 select key,min(city),case when key='москва' then 55.7558 when key='санкт-петербург' then 59.9386 else avg(lat) end,
 case when key='москва' then 37.6176 when key='санкт-петербург' then 30.3141 else avg(lon) end,
 jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address,'coordinates',jsonb_build_object('latitude',lat,'longitude',lon)) order by id),refresh_stamp
 from valid group by key
 on conflict(city_key) do update set name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,points=excluded.points,updated_at=refresh_stamp;
 get diagnostics affected=row_count;
 delete from public.delivery_city_catalog where updated_at<>refresh_stamp;
 return affected;
end $$;
create function public.delivery_catalog_slice(p_city text,p_lat double precision default null,p_lon double precision default null,p_bounds jsonb default null,p_query text default '',p_limit integer default 150)
returns jsonb language sql stable security invoker set search_path='' as $$
 with city as (select * from public.delivery_city_catalog where city_key=p_city), matching as (
  select point,count(*) over() as total,
   power((point->'coordinates'->>'latitude')::float8-coalesce(p_lat,c.latitude),2)+power(((point->'coordinates'->>'longitude')::float8-coalesce(p_lon,c.longitude))*cos(radians(coalesce(p_lat,c.latitude))),2) as distance
  from city c cross join lateral jsonb_array_elements(c.points) point
  where (p_bounds is null or ((point->'coordinates'->>'latitude')::float8 between (p_bounds->>0)::float8 and (p_bounds->>2)::float8 and (point->'coordinates'->>'longitude')::float8 between (p_bounds->>1)::float8 and (p_bounds->>3)::float8))
  and (p_query='' or strpos(lower((point->>'name')||' '||(point->>'address')),lower(p_query))>0)
 ), limited as (select * from matching order by distance,(point->>'id')::bigint limit least(greatest(p_limit,1),200))
 select jsonb_build_object('points',coalesce((select jsonb_agg(point order by distance) from limited),'[]'::jsonb),'hasMore',coalesce((select max(total)>least(greatest(p_limit,1),200) from limited),false),'updatedAt',(select updated_at from city));
$$;
revoke all on function public.normalize_delivery_city(text), public.delivery_address_city(text),public.refresh_delivery_city_catalog(),public.delivery_catalog_slice(text,double precision,double precision,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.normalize_delivery_city(text),public.delivery_address_city(text),public.refresh_delivery_city_catalog(),public.delivery_catalog_slice(text,double precision,double precision,jsonb,text,integer) to service_role;
