begin;

alter table public.app_users
  add column if not exists email text,
  add column if not exists created_by uuid references public.app_users(id) on delete set null,
  add column if not exists last_login_at timestamptz,
  add column if not exists deactivated_at timestamptz;

update public.app_users app_user
set email = lower(auth_user.email)
from auth.users auth_user
where auth_user.id = app_user.id
  and app_user.email is null;

do $$
begin
  if exists (select 1 from public.app_users where email is null or btrim(email) = '') then
    raise exception 'Existem perfis sem e-mail correspondente no Supabase Auth.';
  end if;
end $$;

update public.app_users set email = lower(btrim(email));

alter table public.app_users
  alter column email set not null;

create unique index if not exists idx_app_users_email_lower
  on public.app_users(lower(email));

create index if not exists idx_app_users_created_by
  on public.app_users(created_by);

commit;
