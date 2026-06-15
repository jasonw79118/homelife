-- HomeLife Cloud Backend Schema v2026.06.12.0019
-- Run this in the Supabase SQL Editor.
-- Privacy goal: the GitHub Pages app can save/load only an encrypted blob by
-- one-way workspace ID. Raw household codes, household names, register rows,
-- budgets, pantry items, recipes, and grocery lists are not readable columns.

create table if not exists public.homelife_cloud_workspaces (
  workspace_id text,
  encrypted_payload text not null,
  encryption_version text not null default 'v2',
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Migration support for early beta tables. Older plain metadata columns may
-- exist, but v0016 no longer writes to them or exposes them through RPC.
alter table public.homelife_cloud_workspaces add column if not exists workspace_id text;
alter table public.homelife_cloud_workspaces add column if not exists encrypted_payload text;
alter table public.homelife_cloud_workspaces add column if not exists encryption_version text not null default 'v2';
alter table public.homelife_cloud_workspaces add column if not exists updated_by text;
alter table public.homelife_cloud_workspaces add column if not exists updated_at timestamptz not null default now();

-- If the early beta schema created household_code as the primary key, remove
-- that not-null/primary-key requirement so v0016 can stop storing raw family
-- codes. Existing beta rows remain in the table for manual cleanup/export, but
-- the app no longer reads or writes them.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'homelife_cloud_workspaces'
      and column_name = 'household_code'
  ) then
    alter table public.homelife_cloud_workspaces alter column household_code drop not null;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.homelife_cloud_workspaces'::regclass
      and conname = 'homelife_cloud_workspaces_pkey'
  ) then
    alter table public.homelife_cloud_workspaces drop constraint homelife_cloud_workspaces_pkey;
  end if;
end $$;

create unique index if not exists homelife_cloud_workspaces_workspace_id_key
on public.homelife_cloud_workspaces (workspace_id);

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

-- Remove the early beta table-wide policies. Those policies exposed encrypted
-- rows for browsing through the REST table endpoint. v0016 uses RPC only.
drop policy if exists "HomeLife beta read encrypted workspaces" on public.homelife_cloud_workspaces;
drop policy if exists "HomeLife beta insert encrypted workspaces" on public.homelife_cloud_workspaces;
drop policy if exists "HomeLife beta update encrypted workspaces" on public.homelife_cloud_workspaces;

revoke all on table public.homelife_cloud_workspaces from anon;
revoke all on table public.homelife_cloud_workspaces from authenticated;
revoke all on table public.homelife_cloud_workspaces from public;

grant usage on schema public to anon, authenticated;

-- Force exact function signatures and clear any old beta overloads before recreation.
drop function if exists public.homelife_cloud_ping();
drop function if exists public.homelife_pull_workspace(text);
drop function if exists public.homelife_pull_workspace(jsonb);
drop function if exists public.homelife_upsert_workspace(text, text, text);
drop function if exists public.homelife_upsert_workspace(jsonb);

-- Health check. Returns no household data.
create or replace function public.homelife_cloud_ping()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'service', 'homelife_cloud', 'schema_version', '2026.06.12.0019');
$$;

-- Pull exactly one encrypted workspace by unguessable workspace_id.
-- The app derives this ID from family code + family cloud password.
create or replace function public.homelife_pull_workspace(p_workspace_id text)
returns table(encrypted_payload text, updated_at timestamptz, updated_by text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_workspace_id is null or length(trim(p_workspace_id)) < 20 then
    return;
  end if;

  return query
  select w.encrypted_payload, w.updated_at, w.updated_by
  from public.homelife_cloud_workspaces w
  where w.workspace_id = trim(p_workspace_id)
  limit 1;
end;
$$;

-- Save exactly one encrypted workspace by unguessable workspace_id.
-- No plain household payload is accepted or stored by this function.
create or replace function public.homelife_upsert_workspace(
  p_workspace_id text,
  p_encrypted_payload text,
  p_updated_by text default null
)
returns table(updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_workspace_id is null or length(trim(p_workspace_id)) < 20 then
    raise exception 'Invalid HomeLife workspace id';
  end if;
  if p_encrypted_payload is null or p_encrypted_payload not like 'v2.%' then
    raise exception 'HomeLife cloud payload must be encrypted v2 format';
  end if;

  insert into public.homelife_cloud_workspaces as w
    (workspace_id, encrypted_payload, encryption_version, updated_by, updated_at)
  values
    (trim(p_workspace_id), p_encrypted_payload, 'v2', left(coalesce(p_updated_by, 'home-device'), 64), now())
  on conflict (workspace_id) do update set
    encrypted_payload = excluded.encrypted_payload,
    encryption_version = 'v2',
    updated_by = excluded.updated_by,
    updated_at = now();

  return query
  select w.updated_at
  from public.homelife_cloud_workspaces w
  where w.workspace_id = trim(p_workspace_id)
  limit 1;
end;
$$;

grant execute on function public.homelife_cloud_ping() to anon, authenticated;
grant execute on function public.homelife_pull_workspace(text) to anon, authenticated;
grant execute on function public.homelife_upsert_workspace(text, text, text) to anon, authenticated;


-- Tell Supabase/PostgREST to refresh the function schema cache now.
select pg_notify('pgrst', 'reload schema');

-- Verification after running this file:
--   select public.homelife_cloud_ping();
-- If that returns a JSON object with ok=true, the HomeLife app can test/push/pull.
-- If the app still says PGRST202 immediately after this succeeds, wait 60 seconds
-- and test again so Supabase/PostgREST can refresh its schema cache.
