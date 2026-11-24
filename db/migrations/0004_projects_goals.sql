-- Step 4: projects, goals, capture & chunk, recurring project schedules.

-- A goal has a target date ("by when").
alter table public.goals add column if not exists target_date date;

-- How far ahead a schedule rule has already put blocks on the board. Blocks are made once
-- per day, so a block Ryan deletes or moves stays deleted or moved.
alter table public.schedule_rules add column if not exists filled_through date;

-- Removing a schedule removes its blocks; their actions go back to the Work bench
-- (items.block_id is set null by its own foreign key).
alter table public.blocks drop constraint if exists blocks_rule_id_fkey;
alter table public.blocks
  add constraint blocks_rule_id_fkey foreign key (rule_id) references public.schedule_rules on delete cascade;

-- Puts blocks on the board for every active project's schedule, from p_today through the
-- next p_days days. Runs as the signed-in user, so row-level security limits it to their rules.
-- Returns how many blocks it made. Safe to call on every page load.
create or replace function public.fill_rule_blocks(p_today date, p_days int default 14)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  d date;
  last_day date := p_today + p_days - 1;
  made int := 0;
begin
  for r in
    select s.id, s.user_id, s.days, s.part_of_day, s.length_min, s.pinned_time, s.filled_through,
           p.id as project_id, p.title, p.area_id
    from schedule_rules s
    join projects p on p.id = s.project_id
    where p.status = 'active'
      and (s.filled_through is null or s.filled_through < last_day)
    for update of s
  loop
    d := greatest(p_today, coalesce(r.filled_through + 1, p_today));
    while d <= last_day loop
      if extract(dow from d)::smallint = any (r.days) then
        insert into blocks (user_id, date, name, part_of_day, length_min, start_time, area_id, project_id, rule_id)
        values (r.user_id, d, r.title, r.part_of_day, r.length_min, r.pinned_time, r.area_id, r.project_id, r.id);
        made := made + 1;
      end if;
      d := d + 1;
    end loop;
    update schedule_rules set filled_through = last_day where id = r.id;
  end loop;
  return made;
end;
$$;

revoke execute on function public.fill_rule_blocks(date, int) from public;
grant execute on function public.fill_rule_blocks(date, int) to authenticated;
