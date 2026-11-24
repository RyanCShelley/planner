-- Area Focus: what Ryan is focused on right now in each area, kept with its history.

-- Free-form context about the area ("more about this area"), as rich text (HTML from the editor).
alter table public.areas add column if not exists context text;

-- One row per focus. The current focus has ended_on = null; starting a new one ends it.
create table if not exists public.area_focuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  area_id uuid not null references public.areas on delete cascade,
  body text not null default '',  -- rich text (HTML from the editor)
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists area_focuses_one_current on public.area_focuses (area_id) where ended_on is null;
create index if not exists area_focuses_area on public.area_focuses (user_id, area_id, started_on desc);

-- Dated notes on a focus, current or past ("how is this going?").
create table if not exists public.focus_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  focus_id uuid not null references public.area_focuses on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists focus_notes_focus on public.focus_notes (user_id, focus_id);

grant select, insert, update, delete on public.area_focuses, public.focus_notes to authenticated;

do $$
declare t text;
begin
  foreach t in array array['area_focuses', 'focus_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.area_focuses, public.focus_notes;
