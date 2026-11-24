create table if not exists public.google_calendar_connections (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  planner_calendar_id text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.google_calendar_connections to authenticated;

alter table public.google_calendar_connections enable row level security;

drop policy if exists "own rows" on public.google_calendar_connections;
create policy "own rows" on public.google_calendar_connections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists touch on public.google_calendar_connections;
create trigger touch before update on public.google_calendar_connections
  for each row execute function public.touch_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.google_calendar_connections;
exception
  when duplicate_object then null;
end $$;

alter table public.blocks add column if not exists google_event_id text;
