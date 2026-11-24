-- Workflow redesign: area sub-roles, item status/waiting/batching, project goal_text, review wizard state.

-- 1. Area sub-roles -----------------------------------------------------------
create table if not exists public.area_sub_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  area_id uuid not null references public.areas on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists area_sub_roles_area on public.area_sub_roles (user_id, area_id, sort);

grant select, insert, update, delete on public.area_sub_roles to authenticated;

alter table public.area_sub_roles enable row level security;
drop policy if exists "own rows" on public.area_sub_roles;
create policy "own rows" on public.area_sub_roles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists touch on public.area_sub_roles;
create trigger touch before update on public.area_sub_roles
  for each row execute function public.touch_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.area_sub_roles;
exception when duplicate_object then null;
end $$;

-- Helper to seed default sub-roles for Core Four areas (idempotent per user).
create or replace function public.seed_default_sub_roles(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_faith uuid;
  v_fortitude uuid;
  v_family uuid;
  v_function uuid;
begin
  select id into v_faith from public.areas where user_id = p_user_id and name = 'Faith' limit 1;
  if v_faith is not null and not exists (select 1 from public.area_sub_roles where area_id = v_faith) then
    insert into public.area_sub_roles (user_id, area_id, name, sort) values
      (p_user_id, v_faith, 'Personal Spiritual Growth', 1),
      (p_user_id, v_faith, 'Church', 2);
  end if;

  select id into v_fortitude from public.areas where user_id = p_user_id and name = 'Fortitude' limit 1;
  if v_fortitude is not null and not exists (select 1 from public.area_sub_roles where area_id = v_fortitude) then
    insert into public.area_sub_roles (user_id, area_id, name, sort) values
      (p_user_id, v_fortitude, 'Physical Health', 1),
      (p_user_id, v_fortitude, 'Mental Health', 2);
  end if;

  select id into v_family from public.areas where user_id = p_user_id and name = 'Family' limit 1;
  if v_family is not null and not exists (select 1 from public.area_sub_roles where area_id = v_family) then
    insert into public.area_sub_roles (user_id, area_id, name, sort) values
      (p_user_id, v_family, 'Wife', 1),
      (p_user_id, v_family, 'Boys', 2),
      (p_user_id, v_family, 'Extended Friends', 3);
  end if;

  select id into v_function from public.areas where user_id = p_user_id and name in ('Field & Function', 'Function') limit 1;
  if v_function is not null and not exists (select 1 from public.area_sub_roles where area_id = v_function) then
    insert into public.area_sub_roles (user_id, area_id, name, sort) values
      (p_user_id, v_function, 'AI & Research', 1),
      (p_user_id, v_function, 'SMA', 2);
  end if;
end $$;

-- Update seed_areas() so new users also get default sub-roles.
create or replace function public.seed_areas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.areas (user_id, name, icon, color, sort) values
    (new.id, 'Faith',            'cross',     'amber', 1),
    (new.id, 'Fortitude',        'mountain',  'terra', 2),
    (new.id, 'Family',           'people',    'coral', 3),
    (new.id, 'Field & Function', 'briefcase', 'teal',  4),
    (new.id, 'General',          'house',     'ink',   5);
  perform public.seed_default_sub_roles(new.id);
  return new;
end $$;

-- Backfill existing users.
do $$
declare r record;
begin
  for r in select id from auth.users loop
    perform public.seed_default_sub_roles(r.id);
  end loop;
end $$;

-- 2. Items extensions ---------------------------------------------------------
alter table public.items
  add column if not exists status text not null default 'active' check (status in ('active', 'sometimes', 'pending')),
  add column if not exists sub_role_id uuid references public.area_sub_roles(id) on delete set null,
  add column if not exists waiting_on text,
  add column if not exists batch_tag text;

-- 3. Projects extensions ------------------------------------------------------
alter table public.projects
  add column if not exists goal_text text;

-- 4. Reviews extensions -------------------------------------------------------
alter table public.reviews
  add column if not exists mission_text text,
  add column if not exists resolutions_text text,
  add column if not exists step_completed int default 0;
