begin;

alter table public.subscriptions
  add column if not exists fee_profile_id uuid references public.fee_profiles(id) on delete set null,
  add column if not exists payout_day smallint check (payout_day between 1 and 31),
  add column if not exists payout_month_offset smallint not null default 1 check (payout_month_offset between 0 and 3),
  add column if not exists automatic_billing boolean not null default false,
  add column if not exists automatic_billing_start_month date,
  add column if not exists last_billing_sync_at timestamptz;

alter table public.subscriptions
  drop constraint if exists subscriptions_automatic_billing_start_month_check;
alter table public.subscriptions
  add constraint subscriptions_automatic_billing_start_month_check
  check (automatic_billing_start_month is null or extract(day from automatic_billing_start_month) = 1);

alter table public.financial_transactions
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null,
  add column if not exists customer_payment_status text
    check (customer_payment_status is null or customer_payment_status in ('scheduled','paid','failed','refunded')),
  add column if not exists customer_paid_at date,
  add column if not exists expected_receipt_date date;

create index if not exists idx_financial_transactions_subscription
  on public.financial_transactions(subscription_id);
create unique index if not exists financial_transactions_subscription_cycle_unique
  on public.financial_transactions(subscription_id, competence_month)
  where subscription_id is not null and archived = false;

create or replace view public.v_project_monthly_financials as
with direct as (
  select
    project_id,
    competence_month,
    coalesce(sum(gross_amount_cents) filter (
      where transaction_type = 'revenue'
        and (status = 'received' or customer_payment_status = 'paid')
    ), 0)::bigint as revenue_gross_cents,
    coalesce(sum(fee_amount_cents) filter (
      where transaction_type = 'revenue'
        and (status = 'received' or customer_payment_status = 'paid')
    ), 0)::bigint as revenue_fees_cents,
    coalesce(sum(gross_amount_cents - fee_amount_cents) filter (
      where transaction_type = 'revenue'
        and (status = 'received' or customer_payment_status = 'paid')
    ), 0)::bigint as revenue_net_cents,
    coalesce(sum(gross_amount_cents + fee_amount_cents) filter (
      where transaction_type = 'cost' and status = 'paid' and cost_scope = 'direct'
    ), 0)::bigint as direct_costs_cents
  from public.financial_transactions
  where project_id is not null and archived = false and status <> 'cancelled'
  group by project_id, competence_month
), allocated as (
  select
    a.project_id,
    t.competence_month,
    coalesce(sum(a.allocated_amount_cents), 0)::bigint as shared_costs_cents
  from public.shared_cost_allocations a
  join public.financial_transactions t on t.id = a.transaction_id
  where t.transaction_type = 'cost'
    and t.cost_scope = 'shared'
    and t.status = 'paid'
    and t.archived = false
  group by a.project_id, t.competence_month
), keys as (
  select project_id, competence_month from direct
  union
  select project_id, competence_month from allocated
)
select
  k.project_id,
  k.competence_month,
  coalesce(d.revenue_gross_cents,0)::bigint as revenue_gross_cents,
  coalesce(d.revenue_fees_cents,0)::bigint as revenue_fees_cents,
  coalesce(d.revenue_net_cents,0)::bigint as revenue_net_cents,
  coalesce(d.direct_costs_cents,0)::bigint as direct_costs_cents,
  coalesce(a.shared_costs_cents,0)::bigint as shared_costs_cents,
  (coalesce(d.revenue_net_cents,0) - coalesce(d.direct_costs_cents,0) - coalesce(a.shared_costs_cents,0))::bigint as profit_cents,
  case
    when coalesce(d.revenue_gross_cents,0) = 0 then null
    else ((coalesce(d.revenue_net_cents,0) - coalesce(d.direct_costs_cents,0) - coalesce(a.shared_costs_cents,0))::numeric / d.revenue_gross_cents::numeric) * 100
  end as margin_percentage
from keys k
left join direct d on d.project_id = k.project_id and d.competence_month = k.competence_month
left join allocated a on a.project_id = k.project_id and a.competence_month = k.competence_month;

commit;
