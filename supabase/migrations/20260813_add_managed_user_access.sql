begin;

create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'partner')),
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_user_links (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  partner_id uuid not null unique references public.partners(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_users_role_active
  on public.app_users(role, active);

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
  before update on public.app_users
  for each row execute function public.set_updated_at();

drop trigger if exists trg_partner_user_links_updated_at on public.partner_user_links;
create trigger trg_partner_user_links_updated_at
  before update on public.partner_user_links
  for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.partner_user_links enable row level security;

revoke all on table public.app_users from anon, authenticated;
revoke all on table public.partner_user_links from anon, authenticated;
grant all on table public.app_users to service_role;
grant all on table public.partner_user_links to service_role;

commit;
