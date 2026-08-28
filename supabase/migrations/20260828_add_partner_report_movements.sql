begin;

create table if not exists public.closing_movements (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.monthly_closings(id) on delete cascade,
  source_key text not null,
  transaction_date date not null,
  description text not null,
  movement_kind text not null check (movement_kind in ('revenue','direct_cost','shared_cost')),
  category_name_snapshot text,
  status_snapshot text not null,
  project_amount_cents bigint not null,
  included_in_result boolean not null default true,
  created_at timestamptz not null default now(),
  unique(closing_id, source_key)
);

create index if not exists idx_closing_movements_closing_date
  on public.closing_movements(closing_id, transaction_date, created_at);

alter table public.closing_movements enable row level security;
revoke all on table public.closing_movements from anon, authenticated;
grant all on table public.closing_movements to service_role;

create or replace function public.refresh_closing_movement_snapshot(p_closing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_competence_month date;
  v_status text;
begin
  select project_id, competence_month, status
  into v_project_id, v_competence_month, v_status
  from public.monthly_closings
  where id = p_closing_id;

  if not found then
    raise exception 'Fechamento não encontrado.';
  end if;

  if v_status <> 'closed' then
    return;
  end if;

  delete from public.closing_movements where closing_id = p_closing_id;

  insert into public.closing_movements(
    closing_id, source_key, transaction_date, description, movement_kind,
    category_name_snapshot, status_snapshot, project_amount_cents, included_in_result
  )
  select
    p_closing_id,
    'transaction:' || tx.id::text,
    tx.transaction_date,
    tx.description,
    case when tx.transaction_type = 'revenue' then 'revenue' else 'direct_cost' end,
    category.name,
    case
      when tx.transaction_type = 'revenue'
        and tx.status <> 'received'
        and tx.customer_payment_status = 'paid'
      then 'customer_paid'
      else tx.status
    end,
    case
      when tx.transaction_type = 'revenue'
      then tx.gross_amount_cents - tx.fee_amount_cents
      else -1 * (tx.gross_amount_cents + tx.fee_amount_cents)
    end,
    case
      when tx.transaction_type = 'revenue'
      then tx.status = 'received' or tx.customer_payment_status = 'paid'
      else tx.status = 'paid'
    end
  from public.financial_transactions tx
  left join public.financial_categories category on category.id = tx.category_id
  where tx.project_id = v_project_id
    and tx.competence_month = v_competence_month
    and tx.archived = false
    and tx.status <> 'cancelled'
    and (
      tx.transaction_type = 'revenue'
      or (tx.transaction_type = 'cost' and tx.cost_scope = 'direct')
    );

  insert into public.closing_movements(
    closing_id, source_key, transaction_date, description, movement_kind,
    category_name_snapshot, status_snapshot, project_amount_cents, included_in_result
  )
  select
    p_closing_id,
    'allocation:' || allocation.id::text,
    tx.transaction_date,
    tx.description,
    'shared_cost',
    category.name,
    tx.status,
    -1 * allocation.allocated_amount_cents,
    tx.status = 'paid'
  from public.shared_cost_allocations allocation
  join public.financial_transactions tx on tx.id = allocation.transaction_id
  left join public.financial_categories category on category.id = tx.category_id
  where allocation.project_id = v_project_id
    and tx.competence_month = v_competence_month
    and tx.transaction_type = 'cost'
    and tx.cost_scope = 'shared'
    and tx.archived = false
    and tx.status <> 'cancelled';
end;
$$;

create or replace function public.snapshot_closing_movements_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'closed' then
    perform public.refresh_closing_movement_snapshot(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_closing_movements on public.monthly_closings;
create trigger trg_snapshot_closing_movements
after insert or update of status, closed_at on public.monthly_closings
for each row
execute function public.snapshot_closing_movements_trigger();

select public.refresh_closing_movement_snapshot(id)
from public.monthly_closings
where status = 'closed';

revoke all on function public.refresh_closing_movement_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.snapshot_closing_movements_trigger() from public, anon, authenticated;
grant execute on function public.refresh_closing_movement_snapshot(uuid) to service_role;

commit;
