-- Step 3: a block can carry an area so it shows that area's color and icon.
alter table public.blocks add column if not exists area_id uuid references public.areas on delete set null;
