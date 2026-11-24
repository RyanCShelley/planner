-- Production ran an early copy of 0001 by hand, before grants and the area
-- backfill were added. This makes sure both are in place. Safe to run again.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

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
