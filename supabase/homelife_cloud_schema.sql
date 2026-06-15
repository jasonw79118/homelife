-- HomeLife Cloud Backend Schema v2026.06.12.0013
-- Run this in the Supabase SQL Editor.

create table if not exists public.homelife_cloud_workspaces (
  household_code text primary key,
  household_name text,
  encrypted_payload text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create or replace function public.set_homelife_cloud_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists homelife_cloud_workspaces_updated_at on public.homelife_cloud_workspaces;
create trigger homelife_cloud_workspaces_updated_at
before update on public.homelife_cloud_workspaces
for each row execute function public.set_homelife_cloud_updated_at();

alter table public.homelife_cloud_workspaces enable row level security;

-- Beta policy: permits the static GitHub Pages app to read/write encrypted blobs with the anon key.
-- The actual budget data is encrypted in the browser before upload.
drop policy if exists "HomeLife beta read encrypted workspaces" on public.homelife_cloud_workspaces;
create policy "HomeLife beta read encrypted workspaces"
on public.homelife_cloud_workspaces
for select
to anon
using (true);

drop policy if exists "HomeLife beta insert encrypted workspaces" on public.homelife_cloud_workspaces;
create policy "HomeLife beta insert encrypted workspaces"
on public.homelife_cloud_workspaces
for insert
to anon
with check (true);

drop policy if exists "HomeLife beta update encrypted workspaces" on public.homelife_cloud_workspaces;
create policy "HomeLife beta update encrypted workspaces"
on public.homelife_cloud_workspaces
for update
to anon
using (true)
with check (true);
