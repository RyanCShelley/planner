-- Planner schema, step 1. One person per account; every row belongs to auth.uid().
-- No time estimates anywhere: blocks have a length, items do not.

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- Areas -----------------------------------------------------------------------
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  icon text not null default 'house',
  color text not null default 'ink' check (color in ('amber','terra','coral','teal','ink')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Projects --------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  area_id uuid not null references public.areas on delete restrict,
  title text not null,
  purpose text,
  start_date date,
  finish_date date,
  status text not null default 'active' check (status in ('active','paused','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schedule_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  name text not null,
  days smallint[] not null check (days <@ array[0,1,2,3,4,5,6]::smallint[]), -- 0 = Sunday
  part_of_day text not null default 'morning' check (part_of_day in ('morning','afternoon','evening')),
  length_min int not null default 60 check (length_min > 0),
  pinned_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Goals -----------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  area_id uuid not null references public.areas on delete restrict,
  project_id uuid references public.projects on delete set null,
  goal text not null,      -- what do I want?
  purpose text,            -- why do I want it?
  status text not null default 'active' check (status in ('active','done','dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Blocks ----------------------------------------------------------------------
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  name text not null,
  part_of_day text not null default 'morning' check (part_of_day in ('morning','afternoon','evening')),
  length_min int not null default 60 check (length_min > 0),
  start_time time,                        -- set = pinned; written to Google Calendar
  project_id uuid references public.projects on delete set null,
  rule_id uuid references public.schedule_rules on delete set null,
  gcal_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Captures (capture & chunk) --------------------------------------------------
create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references public.projects on delete cascade, -- null = Inbox
  kind text not null default 'idea' check (kind in ('idea','communication')),
  text text not null,
  chunk text,                             -- label of the approved chunk
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Items (actions, to-dos, chores) ---------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  notes text,
  area_id uuid references public.areas on delete set null,
  project_id uuid references public.projects on delete set null,
  goal_id uuid references public.goals on delete set null,
  block_id uuid references public.blocks on delete set null,
  due_date date,
  repeat text not null default 'never'
    check (repeat in ('never','daily','weekdays','weekly','biweekly','monthly','days')),
  repeat_days smallint[] check (repeat_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  leverage text,
  priority int,
  must boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Calendar cache, push, reviews -----------------------------------------------
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  gcal_event_id text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, gcal_event_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  week_start date not null,
  summary text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- Newer Supabase projects don't grant table access to signed-in users by default.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- Row-level security + updated_at on every table ------------------------------
do $$
declare t text;
begin
  foreach t in array array['areas','projects','schedule_rules','goals','blocks','captures',
                           'items','meetings','push_subscriptions','reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create trigger touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
    execute format('create index on public.%I (user_id)', t);
  end loop;
end $$;

create index on public.items (user_id, done_at);
create index on public.blocks (user_id, date);

-- Seed Ryan's five areas on first sign-in -------------------------------------
create or replace function public.seed_areas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.areas (user_id, name, icon, color, sort) values
    (new.id, 'Faith',            'cross',     'amber', 1),
    (new.id, 'Fortitude',        'mountain',  'terra', 2),
    (new.id, 'Family',           'people',    'coral', 3),
    (new.id, 'Field & Function', 'briefcase', 'teal',  4),
    (new.id, 'General',          'house',     'ink',   5);
  return new;
end $$;

create trigger seed_areas after insert on auth.users
  for each row execute function public.seed_areas();

-- Realtime sync between Mac and iPhone
alter publication supabase_realtime add table
  public.areas, public.projects, public.goals, public.blocks, public.items, public.captures;

-- Accounts created before this script ran get their areas too.
insert into public.areas (user_id, name, icon, color, sort)
select u.id, a.name, a.icon, a.color, a.sort
from auth.users u
cross join (values
  ('Faith','cross','amber',1),
  ('Fortitude','mountain','terra',2),
  ('Family','people','coral',3),
  ('Field & Function','briefcase','teal',4),
  ('General','house','ink',5)
) as a(name, icon, color, sort)
where not exists (select 1 from public.areas x where x.user_id = u.id);
