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

-- 3. Another user sees none of it and cannot write into it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.items;
  if n <> 0 then raise exception 'user B can see % of user A''s items', n; end if;
  update public.areas set name = 'hacked' where user_id = '00000000-0000-0000-0000-0000000000a0';
  select count(*) into n from public.areas where name = 'hacked';
  if n <> 0 then raise exception 'user B changed user A''s area'; end if;
  begin
    insert into public.items (title, user_id) values ('x', '00000000-0000-0000-0000-0000000000a0');
    raise exception 'user B inserted a row as user A';
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
