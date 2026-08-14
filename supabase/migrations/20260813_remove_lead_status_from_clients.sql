begin;

do $$
begin
  if exists (
    select 1
    from public.clients
    where status not in ('active', 'inactive', 'cancelled', 'archived')
  ) then
    raise exception 'Existem clientes com status incompatível. Remova ou ajuste esses registros antes de executar a migração.';
  end if;
end $$;

alter table public.clients
  drop constraint if exists clients_status_check;

alter table public.clients
  add constraint clients_status_check
  check (status in ('active', 'inactive', 'cancelled', 'archived'));

commit;
