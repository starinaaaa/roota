create table public.order_access (
 order_id uuid primary key references public.orders(id) on delete cascade,
 token text not null unique check (token ~ '^[a-f0-9]{64}$'),
 updated_at timestamptz not null default now()
);
alter table public.order_access enable row level security;
revoke all on public.order_access from public,anon,authenticated;
grant select,insert,update,delete on public.order_access to service_role;

-- Server generates 256 random bits. Only an authenticated admin or an owned checkout may call this.
create function public.ensure_order_access(p_order uuid,p_token text,p_rotate boolean default false)
returns text language plpgsql security invoker set search_path='' as $$
declare result text;
begin
 if p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_TOKEN'; end if;
 perform 1 from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 insert into public.order_access(order_id,token) values(p_order,p_token)
 on conflict(order_id) do update set token=case when p_rotate then excluded.token else public.order_access.token end,
 updated_at=case when p_rotate then now() else public.order_access.updated_at end
 returning token into result;
 return result;
end $$;
revoke all on function public.ensure_order_access(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.ensure_order_access(uuid,text,boolean) to service_role;
