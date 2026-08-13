-- Prodexy Labs Manager
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- O app usa apenas a service_role no servidor Next.js. Nenhuma chave privilegiada vai para o browser.

create extension if not exists pgcrypto;

-- ============================================================
-- Helpers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Workspace / projetos / clientes
-- ============================================================
create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  workspace_name text not null default 'Prodexy Labs',
  currency text not null default 'BRL',
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  lead_stale_days integer not null default 14 check (lead_stale_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  project_type text not null check (project_type in ('client','saas','internal')),
  status text not null default 'active' check (status in ('active','paused','closed','archived')),
  description text,
  start_date date,
  end_date date,
  primary_client_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text,
  contact_name text,
  phone text,
  email text,
  status text not null default 'active' check (status in ('lead','active','inactive','cancelled','archived')),
  entry_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects
  drop constraint if exists projects_primary_client_id_fkey;
alter table public.projects
  add constraint projects_primary_client_id_fkey
  foreign key (primary_client_id) references public.clients(id) on delete set null;

create table if not exists public.project_clients (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  relationship_type text not null default 'client' check (relationship_type in ('primary','client','subscriber','partner_client')),
  active boolean not null default true,
  started_at date,
  ended_at date,
  notes text,
  created_at timestamptz not null default now(),
  unique(project_id, client_id)
);

-- ============================================================
-- SaaS: planos e assinaturas
-- ============================================================
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  monthly_amount_cents bigint not null default 0 check (monthly_amount_cents >= 0),
  setup_fee_cents bigint not null default 0 check (setup_fee_cents >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, name)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  plan_id uuid references public.plans(id) on delete set null,
  monthly_amount_cents bigint not null default 0 check (monthly_amount_cents >= 0),
  billing_day smallint check (billing_day between 1 and 31),
  status text not null default 'active' check (status in ('active','trial','overdue','cancelled')),
  start_date date not null default current_date,
  cancellation_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Financeiro
-- ============================================================
create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  applies_to text not null default 'any' check (applies_to in ('any','revenue','cost')),
  goal_bucket text not null default 'other' check (goal_bucket in ('recurring','implementation','other')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fee_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  percentage numeric(9,6) not null default 0 check (percentage >= 0 and percentage <= 100),
  fixed_amount_cents bigint not null default 0 check (fixed_amount_cents >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_financial_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  transaction_type text not null check (transaction_type in ('revenue','cost')),
  category_id uuid references public.financial_categories(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null default 1 check (quantity >= 0),
  unit_amount_cents bigint not null default 0 check (unit_amount_cents >= 0),
  fee_profile_id uuid references public.fee_profiles(id) on delete set null,
  cost_scope text not null default 'direct' check (cost_scope in ('direct','shared','holding')),
  frequency text not null check (frequency in ('monthly','annual','weekly','custom')),
  interval_count integer not null default 1 check (interval_count > 0),
  next_due_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_financial_allocations (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.recurring_financial_templates(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  allocation_percentage numeric(9,6) not null check (allocation_percentage >= 0 and allocation_percentage <= 100),
  created_at timestamptz not null default now(),
  unique(template_id, project_id)
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  transaction_date date not null default current_date,
  competence_month date not null,
  transaction_type text not null check (transaction_type in ('revenue','cost')),
  category_id uuid references public.financial_categories(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null default 1 check (quantity >= 0),
  unit_amount_cents bigint not null default 0 check (unit_amount_cents >= 0),
  gross_amount_cents bigint not null default 0 check (gross_amount_cents >= 0),
  fee_profile_id uuid references public.fee_profiles(id) on delete set null,
  fee_amount_cents bigint not null default 0 check (fee_amount_cents >= 0),
  net_amount_cents bigint generated always as (
    case
      when transaction_type = 'revenue' then gross_amount_cents - fee_amount_cents
      else -1 * (gross_amount_cents + fee_amount_cents)
    end
  ) stored,
  status text not null default 'planned' check (status in ('planned','received','paid','overdue','cancelled')),
  due_date date,
  realized_at date,
  cost_scope text not null default 'direct' check (cost_scope in ('direct','shared','holding')),
  provider text,
  recurring_template_id uuid references public.recurring_financial_templates(id) on delete set null,
  source text not null default 'manual' check (source in ('manual','import','integration','recurrence')),
  external_reference text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(day from competence_month) = 1),
  check (
    transaction_type = 'revenue'
    or cost_scope in ('direct','shared','holding')
  )
);

create table if not exists public.shared_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.financial_transactions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  allocation_method text not null default 'equal' check (allocation_method in ('equal','percentage','manual')),
  percentage numeric(9,6) check (percentage is null or (percentage >= 0 and percentage <= 100)),
  allocated_amount_cents bigint not null check (allocated_amount_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique(transaction_id, project_id)
);

-- ============================================================
-- Sócios / distribuição de lucro
-- ============================================================
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  partner_type text not null default 'external' check (partner_type in ('holding','external')),
  email text,
  phone text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_partners (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete restrict,
  participation_percentage numeric(9,6) not null check (participation_percentage >= 0 and participation_percentage <= 100),
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique(project_id, partner_id, start_date)
);

create table if not exists public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  competence_month date not null,
  revenue_gross_cents bigint not null default 0,
  revenue_fees_cents bigint not null default 0,
  revenue_net_cents bigint not null default 0,
  direct_costs_cents bigint not null default 0,
  shared_costs_cents bigint not null default 0,
  profit_cents bigint not null default 0,
  margin_percentage numeric(12,6),
  status text not null default 'closed' check (status in ('closed','reopened')),
  closed_at timestamptz,
  reopened_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(day from competence_month) = 1),
  unique(project_id, competence_month)
);

create table if not exists public.closing_distributions (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.monthly_closings(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete set null,
  partner_name_snapshot text not null,
  partner_type_snapshot text not null check (partner_type_snapshot in ('holding','external')),
  participation_percentage_snapshot numeric(9,6) not null,
  amount_cents bigint not null default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','cancelled','internal')),
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Metas
-- ============================================================
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null default 'project' check (scope_type in ('project','holding','client_projects')),
  project_id uuid references public.projects(id) on delete cascade,
  competence_month date not null,
  target_clients integer not null default 0 check (target_clients >= 0),
  target_setup_revenue_cents bigint not null default 0 check (target_setup_revenue_cents >= 0),
  target_recurring_revenue_cents bigint not null default 0 check (target_recurring_revenue_cents >= 0),
  target_total_revenue_cents bigint not null default 0 check (target_total_revenue_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(day from competence_month) = 1),
  check ((scope_type = 'project' and project_id is not null) or (scope_type <> 'project' and project_id is null))
);
create unique index if not exists goals_scope_month_unique
  on public.goals(scope_type, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), competence_month);

-- ============================================================
-- Demandas / tempo
-- ============================================================
create table if not exists public.task_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  category_id uuid references public.task_categories(id) on delete set null,
  priority text not null default 'medium' check (priority in ('critical','high','medium','low')),
  frequency text not null check (frequency in ('daily','weekly','monthly','custom')),
  interval_count integer not null default 1 check (interval_count > 0),
  next_run_date date,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  category_id uuid references public.task_categories(id) on delete set null,
  priority text not null default 'medium' check (priority in ('critical','high','medium','low')),
  status text not null default 'inbox' check (status in ('inbox','backlog','planned','in_progress','waiting','done','cancelled')),
  due_at timestamptz,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
  next_action text,
  origin text,
  waiting_since timestamptz,
  recurring_template_id uuid references public.recurring_task_templates(id) on delete set null,
  notes text,
  completed_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table if not exists public.task_time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null default current_date,
  available_minutes integer not null check (available_minutes > 0),
  planned_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  status text not null default 'planned' check (status in ('planned','active','completed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_session_items (
  id uuid primary key default gen_random_uuid(),
  work_session_id uuid not null references public.work_sessions(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  position integer not null default 0,
  planned_minutes integer not null check (planned_minutes > 0),
  score numeric(12,3),
  reason text,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  unique(work_session_id, task_id)
);

-- ============================================================
-- Comercial
-- ============================================================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  phone text,
  email text,
  source text,
  interest_project_id uuid references public.projects(id) on delete set null,
  interest_label text,
  temperature text not null default 'warm' check (temperature in ('cold','warm','hot')),
  stage text not null default 'new' check (stage in ('new','qualification','contact','meeting','proposal','negotiation','won','lost')),
  estimated_setup_cents bigint not null default 0 check (estimated_setup_cents >= 0),
  estimated_monthly_cents bigint not null default 0 check (estimated_monthly_cents >= 0),
  last_contact_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  notes text,
  won_client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  activity_type text not null check (activity_type in ('contact','meeting','proposal','note','stage_change')),
  description text not null,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Índices
-- ============================================================
create index if not exists idx_financial_transactions_competence on public.financial_transactions(competence_month);
create index if not exists idx_financial_transactions_project on public.financial_transactions(project_id);
create index if not exists idx_financial_transactions_status on public.financial_transactions(status);
create index if not exists idx_financial_transactions_type on public.financial_transactions(transaction_type);
create index if not exists idx_financial_transactions_realized on public.financial_transactions(realized_at);
create unique index if not exists financial_transactions_external_reference_unique
  on public.financial_transactions(external_reference) where external_reference is not null;
create index if not exists idx_recurring_financial_allocations_template on public.recurring_financial_allocations(template_id);
create index if not exists idx_shared_allocations_project on public.shared_cost_allocations(project_id);
create index if not exists idx_project_partners_project_dates on public.project_partners(project_id, start_date, end_date);
create index if not exists idx_tasks_status_priority on public.tasks(status, priority);
create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_tasks_due_at on public.tasks(due_at);
create index if not exists idx_time_entries_project on public.task_time_entries(project_id, started_at);
create index if not exists idx_leads_stage_temperature on public.leads(stage, temperature);
create index if not exists idx_leads_next_action on public.leads(next_action_at);
create index if not exists idx_subscriptions_project_status on public.subscriptions(project_id, status);
create index if not exists idx_goals_month on public.goals(competence_month);

-- ============================================================
-- Triggers updated_at
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings','projects','clients','plans','subscriptions','fee_profiles',
    'recurring_financial_templates','financial_transactions','partners','project_partners',
    'monthly_closings','closing_distributions','goals','recurring_task_templates','tasks',
    'work_sessions','leads'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ============================================================
-- Views gerenciais
-- ============================================================
create or replace view public.v_project_monthly_financials as
with direct as (
  select
    project_id,
    competence_month,
    coalesce(sum(gross_amount_cents) filter (where transaction_type = 'revenue' and status = 'received'), 0)::bigint as revenue_gross_cents,
    coalesce(sum(fee_amount_cents) filter (where transaction_type = 'revenue' and status = 'received'), 0)::bigint as revenue_fees_cents,
    coalesce(sum(gross_amount_cents - fee_amount_cents) filter (where transaction_type = 'revenue' and status = 'received'), 0)::bigint as revenue_net_cents,
    coalesce(sum(gross_amount_cents + fee_amount_cents) filter (where transaction_type = 'cost' and status = 'paid' and cost_scope = 'direct'), 0)::bigint as direct_costs_cents
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

create or replace view public.v_consolidated_monthly_cash as
select
  competence_month,
  coalesce(sum(gross_amount_cents) filter (where transaction_type='revenue' and status='received'),0)::bigint as revenue_gross_cents,
  coalesce(sum(fee_amount_cents) filter (where transaction_type='revenue' and status='received'),0)::bigint as revenue_fees_cents,
  coalesce(sum(gross_amount_cents-fee_amount_cents) filter (where transaction_type='revenue' and status='received'),0)::bigint as revenue_net_cents,
  coalesce(sum(gross_amount_cents+fee_amount_cents) filter (where transaction_type='cost' and status='paid'),0)::bigint as total_costs_cents,
  (
    coalesce(sum(gross_amount_cents-fee_amount_cents) filter (where transaction_type='revenue' and status='received'),0)
    - coalesce(sum(gross_amount_cents+fee_amount_cents) filter (where transaction_type='cost' and status='paid'),0)
  )::bigint as consolidated_result_before_distributions_cents
from public.financial_transactions
where archived=false and status <> 'cancelled'
group by competence_month;

-- ============================================================
-- RLS: tabelas públicas sem acesso anon/authenticated.
-- O Next.js acessa usando service_role APENAS no servidor.
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings','projects','clients','project_clients','plans','subscriptions',
    'financial_categories','fee_profiles','recurring_financial_templates','recurring_financial_allocations','financial_transactions',
    'shared_cost_allocations','partners','project_partners','monthly_closings','closing_distributions',
    'goals','task_categories','recurring_task_templates','tasks','task_dependencies','task_time_entries',
    'work_sessions','work_session_items','leads','lead_activities'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

grant usage on schema public to service_role;
revoke all on public.v_project_monthly_financials from public, anon, authenticated;
revoke all on public.v_consolidated_monthly_cash from public, anon, authenticated;
grant select on public.v_project_monthly_financials to service_role;
grant select on public.v_consolidated_monthly_cash to service_role;

-- ============================================================
-- Seeds mínimos conhecidos
-- ============================================================
insert into public.app_settings(id, workspace_name)
values (1, 'Prodexy Labs')
on conflict (id) do update set workspace_name = excluded.workspace_name;

insert into public.projects(name, project_type, status)
values
  ('Vale do Itaúnas', 'client', 'active'),
  ('Angel Cosméticos', 'client', 'active'),
  ('Oficina Mais', 'saas', 'active'),
  ('Escolinha Pro', 'saas', 'active')
on conflict (name) do nothing;

insert into public.clients(name, company_name, status)
select v.name, v.company_name, 'active'
from (values
  ('Viação do Vale do Itaúnas','Viação do Vale do Itaúnas'),
  ('Angel Cosméticos','Angel Cosméticos'),
  ('Alinha Center','Alinha Center'),
  ('Zequinha Pneus','Zequinha Pneus'),
  ('ECG','ECG')
) as v(name, company_name)
where not exists (select 1 from public.clients c where c.name = v.name);

-- Relações conhecidas
insert into public.project_clients(project_id, client_id, relationship_type, active)
select p.id, c.id, 'primary', true
from public.projects p join public.clients c on c.name='Viação do Vale do Itaúnas'
where p.name='Vale do Itaúnas'
on conflict (project_id, client_id) do nothing;

update public.projects p
set primary_client_id = c.id
from public.clients c
where p.name='Vale do Itaúnas' and c.name='Viação do Vale do Itaúnas' and p.primary_client_id is null;

insert into public.project_clients(project_id, client_id, relationship_type, active)
select p.id, c.id, 'primary', true
from public.projects p join public.clients c on c.name='Angel Cosméticos'
where p.name='Angel Cosméticos'
on conflict (project_id, client_id) do nothing;

update public.projects p
set primary_client_id = c.id
from public.clients c
where p.name='Angel Cosméticos' and c.name='Angel Cosméticos' and p.primary_client_id is null;

insert into public.project_clients(project_id, client_id, relationship_type, active)
select p.id, c.id, 'subscriber', true
from public.projects p
join public.clients c on c.name in ('Alinha Center','Zequinha Pneus')
where p.name='Oficina Mais'
on conflict (project_id, client_id) do nothing;

insert into public.project_clients(project_id, client_id, relationship_type, active)
select p.id, c.id, 'subscriber', true
from public.projects p
join public.clients c on c.name='ECG'
where p.name='Escolinha Pro'
on conflict (project_id, client_id) do nothing;

insert into public.financial_categories(name, applies_to, goal_bucket)
values
  ('Mensalidade','any','recurring'),
  ('Implantação','revenue','implementation'),
  ('Implementação','revenue','implementation'),
  ('Domínio','cost','other'),
  ('Compra','cost','other'),
  ('DAS','cost','other'),
  ('Infraestrutura','cost','other'),
  ('Serviços','any','other'),
  ('Outros','any','other')
on conflict (name) do nothing;

insert into public.fee_profiles(name, percentage, fixed_amount_cents, active, notes)
values ('Sem taxa', 0, 0, true, 'Perfil padrão sem taxa financeira.')
on conflict (name) do nothing;

insert into public.task_categories(name)
values
  ('Bug'),('Correção'),('Melhoria'),('Implantação'),('Pedido de cliente'),('Ideia'),
  ('Reunião'),('Financeiro'),('Comercial'),('Planejamento'),('Revisão'),('Inovação'),('Administrativo')
on conflict (name) do nothing;

insert into public.partners(name, partner_type, active, notes)
values ('Prodexy Labs','holding',true,'Participante interno da holding. Não gera repasse bancário para si mesma.')
on conflict (name) do update set partner_type='holding', active=true;

-- Metas legadas da planilha. Agosto/2026 a março/2027.
-- Prodexy da planilha foi interpretada como meta agregada dos projetos de cliente,
-- pois Prodexy Labs é a holding e não um projeto fictício.
insert into public.goals(scope_type, project_id, competence_month, target_clients, target_setup_revenue_cents, target_recurring_revenue_cents, target_total_revenue_cents, notes)
values
  ('client_projects',null,'2026-08-01',2,30000,13000,43000,'Importado conceitualmente da planilha de metas.'),
  ('client_projects',null,'2026-09-01',3,30000,26000,56000,'Importado conceitualmente da planilha de metas.'),
  ('client_projects',null,'2026-10-01',4,1030000,39000,1069000,'Importado conceitualmente da planilha de metas.'),
  ('client_projects',null,'2026-11-01',5,30000,102000,132000,'Importado conceitualmente da planilha de metas.'),
  ('client_projects',null,'2026-12-01',6,30000,115000,145000,'Importado conceitualmente da planilha de metas.'),
  ('client_projects',null,'2027-01-01',7,30000,128000,158000,'Importado conceitualmente da planilha de metas.'),
  ('client_projects',null,'2027-02-01',8,30000,141000,171000,'Importado conceitualmente da planilha de metas.'),
  ('client_projects',null,'2027-03-01',9,30000,154000,184000,'Importado conceitualmente da planilha de metas.')
on conflict do nothing;

insert into public.goals(scope_type, project_id, competence_month, target_clients, target_setup_revenue_cents, target_recurring_revenue_cents, target_total_revenue_cents, notes)
select 'project', p.id, v.month::date, v.clients, v.setup_cents, v.recurring_cents, v.setup_cents + v.recurring_cents, 'Importado conceitualmente da planilha de metas.'
from public.projects p
cross join (values
  ('2026-08-01',1,0,13000),('2026-09-01',2,0,13000),('2026-10-01',2,0,26000),('2026-11-01',2,500000,26000),
  ('2026-12-01',2,0,26000),('2027-01-01',3,0,26000),('2027-02-01',3,0,39000),('2027-03-01',3,0,39000)
) as v(month,clients,setup_cents,recurring_cents)
where p.name='Escolinha Pro'
on conflict do nothing;

insert into public.goals(scope_type, project_id, competence_month, target_clients, target_setup_revenue_cents, target_recurring_revenue_cents, target_total_revenue_cents, notes)
select 'project', p.id, v.month::date, v.clients, v.setup_cents, v.recurring_cents, v.setup_cents + v.recurring_cents, 'Importado conceitualmente da planilha de metas.'
from public.projects p
cross join (values
  ('2026-08-01',2,0,13000),('2026-09-01',3,0,26000),('2026-10-01',4,0,39000),('2026-11-01',5,0,52000),
  ('2026-12-01',6,0,65000),('2027-01-01',7,0,78000),('2027-02-01',8,0,91000),('2027-03-01',9,0,104000)
) as v(month,clients,setup_cents,recurring_cents)
where p.name='Oficina Mais'
on conflict do nothing;

-- ============================================================
-- RPCs de fechamento (atômicos no PostgreSQL)
-- ============================================================
create or replace function public.close_project_month(p_project_id uuid, p_competence_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_competence_month)::date;
  v_revenue_gross bigint := 0;
  v_revenue_fees bigint := 0;
  v_revenue_net bigint := 0;
  v_direct_costs bigint := 0;
  v_shared_costs bigint := 0;
  v_profit bigint := 0;
  v_margin numeric := null;
  v_closing_id uuid;
  v_partner_count integer := 0;
  v_percentage_sum numeric := 0;
  v_distributable_profit bigint := 0;
  v_sum_distributions bigint := 0;
  v_delta bigint := 0;
  v_target_distribution uuid;
begin
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Projeto não encontrado.';
  end if;

  select
    coalesce(f.revenue_gross_cents, 0),
    coalesce(f.revenue_fees_cents, 0),
    coalesce(f.revenue_net_cents, 0),
    coalesce(f.direct_costs_cents, 0),
    coalesce(f.shared_costs_cents, 0),
    coalesce(f.profit_cents, 0),
    f.margin_percentage
  into
    v_revenue_gross,
    v_revenue_fees,
    v_revenue_net,
    v_direct_costs,
    v_shared_costs,
    v_profit,
    v_margin
  from public.v_project_monthly_financials f
  where f.project_id = p_project_id
    and f.competence_month = v_month;

  -- Uma competência sem movimentos não aparece na view.
  if not found then
    v_revenue_gross := 0;
    v_revenue_fees := 0;
    v_revenue_net := 0;
    v_direct_costs := 0;
    v_shared_costs := 0;
    v_profit := 0;
    v_margin := null;
  end if;

  select count(*), coalesce(sum(pp.participation_percentage), 0)
  into v_partner_count, v_percentage_sum
  from public.project_partners pp
  where pp.project_id = p_project_id
    and pp.active = true
    and pp.start_date <= v_month
    and (pp.end_date is null or pp.end_date >= v_month);

  if v_partner_count > 0 and abs(v_percentage_sum - 100) > 0.0001 then
    raise exception 'A soma das participações ativas deve ser 100%%. Atual: %', v_percentage_sum;
  end if;

  insert into public.monthly_closings(
    project_id, competence_month, revenue_gross_cents, revenue_fees_cents, revenue_net_cents,
    direct_costs_cents, shared_costs_cents, profit_cents, margin_percentage, status, closed_at, reopened_at
  ) values (
    p_project_id, v_month,
    v_revenue_gross, v_revenue_fees, v_revenue_net,
    v_direct_costs, v_shared_costs, v_profit,
    v_margin, 'closed', now(), null
  )
  on conflict (project_id, competence_month) do update set
    revenue_gross_cents = excluded.revenue_gross_cents,
    revenue_fees_cents = excluded.revenue_fees_cents,
    revenue_net_cents = excluded.revenue_net_cents,
    direct_costs_cents = excluded.direct_costs_cents,
    shared_costs_cents = excluded.shared_costs_cents,
    profit_cents = excluded.profit_cents,
    margin_percentage = excluded.margin_percentage,
    status = 'closed',
    closed_at = now(),
    reopened_at = null,
    updated_at = now()
  returning id into v_closing_id;

  delete from public.closing_distributions where closing_id = v_closing_id;

  -- Distribuição só existe para lucro positivo. Prejuízo permanece no resultado
  -- do projeto e não vira obrigação positiva para nenhum participante.
  v_distributable_profit := greatest(v_profit, 0);

  if v_distributable_profit > 0 then
    if v_partner_count = 0 then
      insert into public.closing_distributions(
        closing_id, partner_id, partner_name_snapshot, partner_type_snapshot,
        participation_percentage_snapshot, amount_cents, payment_status
      )
      select v_closing_id, p.id, p.name, p.partner_type, 100, v_distributable_profit, 'internal'
      from public.partners p
      where p.partner_type = 'holding' and p.active = true
      order by p.created_at
      limit 1;

      if not found then
        raise exception 'Participante interno Prodexy Labs não encontrado.';
      end if;
    else
      insert into public.closing_distributions(
        closing_id, partner_id, partner_name_snapshot, partner_type_snapshot,
        participation_percentage_snapshot, amount_cents, payment_status
      )
      select
        v_closing_id,
        p.id,
        p.name,
        p.partner_type,
        pp.participation_percentage,
        round(v_distributable_profit::numeric * pp.participation_percentage / 100)::bigint,
        case when p.partner_type = 'holding' then 'internal' else 'pending' end
      from public.project_partners pp
      join public.partners p on p.id = pp.partner_id
      where pp.project_id = p_project_id
        and pp.active = true
        and pp.start_date <= v_month
        and (pp.end_date is null or pp.end_date >= v_month);
    end if;

    -- Corrige eventual diferença de centavos causada por arredondamento.
    select coalesce(sum(amount_cents), 0)
    into v_sum_distributions
    from public.closing_distributions
    where closing_id = v_closing_id;

    v_delta := v_distributable_profit - v_sum_distributions;

    if v_delta <> 0 then
      select id into v_target_distribution
      from public.closing_distributions
      where closing_id = v_closing_id
      order by (partner_type_snapshot = 'holding') desc, amount_cents desc, created_at
      limit 1;

      if v_target_distribution is not null then
        update public.closing_distributions
        set amount_cents = amount_cents + v_delta
        where id = v_target_distribution;
      end if;
    end if;
  end if;

  return v_closing_id;
end;
$$;

create or replace function public.reopen_project_month(p_closing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.monthly_closings where id = p_closing_id) then
    raise exception 'Fechamento não encontrado.';
  end if;

  if exists (
    select 1 from public.closing_distributions
    where closing_id = p_closing_id
      and partner_type_snapshot = 'external'
      and payment_status = 'paid'
  ) then
    raise exception 'Não é possível reabrir: existe distribuição externa marcada como paga. Regularize o repasse antes de reabrir o fechamento.';
  end if;

  update public.closing_distributions
  set payment_status = 'cancelled', paid_at = null, updated_at = now()
  where closing_id = p_closing_id
    and partner_type_snapshot = 'external'
    and payment_status = 'pending';

  update public.monthly_closings
  set status = 'reopened', reopened_at = now(), updated_at = now()
  where id = p_closing_id;
end;
$$;

revoke all on function public.close_project_month(uuid,date) from public, anon, authenticated;
revoke all on function public.reopen_project_month(uuid) from public, anon, authenticated;
grant execute on function public.close_project_month(uuid,date) to service_role;
grant execute on function public.reopen_project_month(uuid) to service_role;

-- Final
select 'Prodexy Labs schema criado com sucesso.' as result;
