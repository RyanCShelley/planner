-- Database checks, run after migrations (scripts/test-db.sh, and in CI on real Supabase).
-- Every check raises an exception on failure, so psql -v ON_ERROR_STOP=1 fails the run.
\set ON_ERROR_STOP 1
begin;

-- A user who existed before migrations (like Ryan) and one created after.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b0', 'new@test') on conflict do nothing;

do $$
declare n int;
begin
  -- 1. Every user has exactly the five seeded areas.
  select count(*) into n from public.areas where user_id = '00000000-0000-0000-0000-0000000000a0';
  if n <> 5 then raise exception 'pre-existing user has % areas, expected 5', n; end if;
  select count(*) into n from public.areas where user_id = '00000000-0000-0000-0000-0000000000b0';
  if n <> 5 then raise exception 'new user has % areas, expected 5', n; end if;
end $$;

-- 2. As a signed-in user: can read, add, change and complete own items.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);

do $$
declare n int; fam uuid; iid uuid;
begin
  select count(*) into n from public.areas;
  if n <> 5 then raise exception 'user A sees % areas, expected only their own 5', n; end if;

  insert into public.items (title) values ('Feed the chickens') returning id into iid;
  select id into fam from public.areas where name = 'Family';
  update public.items set area_id = fam where id = iid;
  select count(*) into n from public.items where area_id = fam and done_at is null;
  if n <> 1 then raise exception 'item not found under its area after update'; end if;

  update public.items set done_at = now() where id = iid;
  update public.items set done_at = null where id = iid;
  select count(*) into n from public.items where id = iid and done_at is null;
  if n <> 1 then raise exception 'reopen failed'; end if;

  insert into public.blocks (date, name) values (current_date, 'Focus');
  insert into public.areas (name) values ('Side project');
end $$;

-- 2b. A project schedule puts blocks on the board once per day, and only once.
do $$
declare n int; fld uuid; pid uuid; rid uuid; gid uuid;
begin
  select id into fld from public.areas where name = 'Field & Function';
  insert into public.projects (area_id, title) values (fld, 'Thesis') returning id into pid;
  insert into public.goals (area_id, project_id, goal, target_date) values (fld, pid, 'Submit chapter 3', '2027-01-15') returning id into gid;
  insert into public.captures (project_id, kind, text) values (pid, 'communication', 'Email my advisor');
  -- Mon, Wed, Fri mornings. 2026-11-23 is a Monday, so 14 days hold 6 of them.
  insert into public.schedule_rules (project_id, name, days, part_of_day, length_min)
    values (pid, 'Writing', '{1,3,5}', 'morning', 90) returning id into rid;

  n := public.fill_rule_blocks('2026-11-23', 14);
  if n <> 6 then raise exception 'schedule made % blocks, expected 6', n; end if;
  select count(*) into n from public.blocks where rule_id = rid and name = 'Thesis' and area_id = fld and length_min = 90;
  if n <> 6 then raise exception 'schedule blocks have the wrong name, area or length'; end if;

  n := public.fill_rule_blocks('2026-11-23', 14);
  if n <> 0 then raise exception 'second fill made % more blocks, expected 0', n; end if;

  -- A block Ryan deletes stays deleted.
  delete from public.blocks where id = (select id from public.blocks where rule_id = rid order by date limit 1);
  n := public.fill_rule_blocks('2026-11-23', 14);
  if n <> 0 then raise exception 'a deleted schedule block came back'; end if;

  -- A day later, only the new day is added (2026-12-07 is a Monday).
  n := public.fill_rule_blocks('2026-11-24', 14);
  if n <> 1 then raise exception 'next day fill made % blocks, expected 1', n; end if;

  -- Paused projects get no new blocks.
  update public.projects set status = 'paused' where id = pid;
  n := public.fill_rule_blocks('2026-11-30', 14);
  if n <> 0 then raise exception 'paused project got % blocks', n; end if;
  update public.projects set status = 'active' where id = pid;

  -- Removing the schedule removes its blocks.
  delete from public.schedule_rules where id = rid;
  select count(*) into n from public.blocks where project_id = pid;
  if n <> 0 then raise exception 'removing a schedule left % blocks', n; end if;

  -- Re-add for the other-user check below.
  insert into public.schedule_rules (project_id, name, days) values (pid, 'Reading', '{2}');
end $$;

-- 2c. Area Focus: one current focus per area; starting a new one keeps the old as history.
do $$
declare n int; fam uuid; f1 uuid;
begin
  select id into fam from public.areas where name = 'Family';
  update public.areas set context = '<p>Five kids, one farm.</p>' where id = fam;
  insert into public.area_focuses (area_id, body) values (fam, '<p>Evenings with the kids</p>') returning id into f1;
  insert into public.focus_notes (focus_id, body) values (f1, 'Good week');
  begin
    insert into public.area_focuses (area_id, body) values (fam, '<p>second current</p>');
    raise exception 'an area got two current focuses';
  exception when unique_violation then null; -- expected
  end;
  update public.area_focuses set ended_on = current_date where id = f1;
  insert into public.area_focuses (area_id, body) values (fam, '<p>Family dinners</p>');
  select count(*) into n from public.area_focuses where area_id = fam;
  if n <> 2 then raise exception 'focus history has % entries, expected 2', n; end if;
end $$;

-- 2d. Sub-roles, item statuses, project goal_text, and review wizard state.
do $$
declare n int; fam uuid; srid uuid; pid uuid; rid uuid;
begin
  select count(*) into n from public.area_sub_roles;
  if n <> 9 then raise exception 'user A has % seeded sub-roles, expected 9', n; end if;

  select id into fam from public.areas where name = 'Family';
  insert into public.area_sub_roles (area_id, name, sort) values (fam, 'Date Night', 4) returning id into srid;

  insert into public.items (title, area_id, sub_role_id, status, waiting_on, batch_tag)
    values ('Plan trip', fam, srid, 'pending', 'Travel agent', 'errands');
  select count(*) into n from public.items where status = 'pending' and sub_role_id = srid and waiting_on = 'Travel agent' and batch_tag = 'errands';
  if n <> 1 then raise exception 'item with sub_role_id/status/waiting_on/batch_tag not found'; end if;

  insert into public.projects (area_id, title, goal_text) values (fam, 'Summer Vacation', 'Book flights and cabin') returning id into pid;
  select count(*) into n from public.projects where id = pid and goal_text = 'Book flights and cabin';
  if n <> 1 then raise exception 'project goal_text not saved'; end if;

  insert into public.reviews (week_of, mission_text, resolutions_text, step_completed)
    values ('2026-11-23', 'Be present', 'Exercise 3x/week', 2) returning id into rid;
  select count(*) into n from public.reviews where id = rid and step_completed = 2;
  if n <> 1 then raise exception 'review wizard state not saved'; end if;
end $$;

-- 3. Another user sees none of it and cannot write into it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.items;
  if n <> 0 then raise exception 'user B can see % of user A''s items', n; end if;
  n := public.fill_rule_blocks('2026-11-23', 14);
  if n <> 0 then raise exception 'user B''s fill made % blocks from user A''s schedule', n; end if;
  select count(*) into n from public.projects;
  if n <> 0 then raise exception 'user B can see user A''s projects'; end if;
  select count(*) into n from public.captures;
  if n <> 0 then raise exception 'user B can see user A''s captures'; end if;
  select count(*) into n from public.area_focuses;
  if n <> 0 then raise exception 'user B can see user A''s focus'; end if;
  select count(*) into n from public.focus_notes;
  if n <> 0 then raise exception 'user B can see user A''s focus notes'; end if;
  select count(*) into n from public.area_sub_roles;
  if n <> 9 then raise exception 'user B sees % sub-roles, expected only their own 9', n; end if;
  select count(*) into n from public.reviews;
  if n <> 0 then raise exception 'user B can see user A''s reviews'; end if;
  update public.areas set name = 'hacked' where user_id = '00000000-0000-0000-0000-0000000000a0';
  select count(*) into n from public.areas where name = 'hacked';
  if n <> 0 then raise exception 'user B changed user A''s area'; end if;
  begin
    insert into public.items (title, user_id) values ('x', '00000000-0000-0000-0000-0000000000a0');
    raise exception 'user B inserted a row as user A';
  exception when insufficient_privilege then null; -- expected: blocked by RLS
  end;
  begin
    insert into public.area_sub_roles (area_id, name, user_id)
      values ((select id from public.areas limit 1), 'hack', '00000000-0000-0000-0000-0000000000a0');
    raise exception 'user B inserted a sub-role as user A';
  exception when insufficient_privilege then null; -- expected: blocked by RLS
  end;
end $$;

-- 4. Signed-out visitors get nothing.
reset role;
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.items;
    if n <> 0 then raise exception 'anon can read items'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
\echo 'db checks: all passed'
