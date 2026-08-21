begin;

create or replace function public.validate_shared_cost_allocation_total()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  transaction_total_cents bigint;
  existing_allocation_cents bigint;
begin
  select gross_amount_cents + fee_amount_cents
    into transaction_total_cents
  from public.financial_transactions
  where id = new.transaction_id
    and transaction_type = 'cost'
    and cost_scope = 'shared'
  for update;

  if transaction_total_cents is null then
    raise exception 'Shared cost allocation requires a shared cost transaction.';
  end if;

  select coalesce(sum(allocated_amount_cents), 0)::bigint
    into existing_allocation_cents
  from public.shared_cost_allocations
  where transaction_id = new.transaction_id
    and id <> new.id;

  if existing_allocation_cents + new.allocated_amount_cents > transaction_total_cents then
    raise exception 'Shared cost allocations cannot exceed the original cost.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_shared_cost_allocation_total on public.shared_cost_allocations;
create trigger trg_validate_shared_cost_allocation_total
before insert or update on public.shared_cost_allocations
for each row execute function public.validate_shared_cost_allocation_total();

create or replace function public.validate_shared_cost_transaction_total()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  allocated_cents bigint;
begin
  select coalesce(sum(allocated_amount_cents), 0)::bigint
    into allocated_cents
  from public.shared_cost_allocations
  where transaction_id = new.id;

  if allocated_cents > 0 and (new.transaction_type <> 'cost' or new.cost_scope <> 'shared') then
    raise exception 'A transaction with shared allocations must remain a shared cost.';
  end if;

  if allocated_cents > new.gross_amount_cents + new.fee_amount_cents then
    raise exception 'Shared cost allocations cannot exceed the original cost.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_shared_cost_transaction_total on public.financial_transactions;
create trigger trg_validate_shared_cost_transaction_total
before update of transaction_type, cost_scope, gross_amount_cents, fee_amount_cents
on public.financial_transactions
for each row execute function public.validate_shared_cost_transaction_total();

do $$
begin
  if exists (
    select 1
    from public.shared_cost_allocations allocation
    join public.financial_transactions tx on tx.id = allocation.transaction_id
    join public.projects project on project.id = allocation.project_id
    join public.monthly_closings closing
      on closing.project_id = project.id
      and closing.competence_month = tx.competence_month
      and closing.status = 'closed'
    where tx.transaction_date = date '2026-08-20'
      and tx.description = 'Inscrição Google Play Console'
      and tx.gross_amount_cents + tx.fee_amount_cents = 15000
      and project.name = 'Vale do Itaúnas'
      and allocation.allocated_amount_cents = 15000
  ) then
    raise exception 'Reopen the Vale do Itaunas August 2026 closing before correcting the shared cost allocation.';
  end if;
end;
$$;

update public.shared_cost_allocations allocation
set allocated_amount_cents = 7500,
    percentage = 50,
    allocation_method = 'manual',
    notes = concat_ws(' | ', nullif(allocation.notes, ''), 'Correcao explicita: R$ 75,00 no projeto; saldo de R$ 75,00 na holding.')
from public.financial_transactions tx,
     public.projects project
where tx.id = allocation.transaction_id
  and project.id = allocation.project_id
  and tx.transaction_date = date '2026-08-20'
  and tx.description = 'Inscrição Google Play Console'
  and tx.gross_amount_cents + tx.fee_amount_cents = 15000
  and project.name = 'Vale do Itaúnas'
  and allocation.allocated_amount_cents = 15000;

commit;
