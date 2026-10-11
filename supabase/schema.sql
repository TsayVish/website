-- tsayvish database setup
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.
-- It is safe to run again: it only adds what's missing and refreshes the access rules.
--
-- Row-level security (RLS) is on for every table, so each person can only read and
-- change their own rows, even though the browser talks to the database directly.

-- ─────────────────────────────────────────────────────────────
-- Profiles: one row per account, created automatically at sign-up
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text check (full_name is null or char_length(full_name) <= 80),
  goal       text not null default 'build' check (goal in ('build', 'partner')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles: read own" on public.profiles;
create policy "Profiles: read own" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: update own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Copy the name and "what brings you here" answer from the sign-up form into profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, goal)
  values (
    new.id,
    left(new.raw_user_meta_data ->> 'full_name', 80),
    case when new.raw_user_meta_data ->> 'goal' = 'partner' then 'partner' else 'build' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Projects. Each one is either:
--   'original'    a character the person creates and owns, or
--   'partnership' a request to work with characters from the tsayvish cast.
-- A person can have as many projects of either type as they like.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type         text not null check (type in ('original', 'partnership')),
  name         text not null check (char_length(name) between 1 and 60),

  -- Original projects: the character
  kind         text check (kind in ('Person', 'Creature', 'Robot', 'Food', 'Object', 'Animal')),
  color        text check (color in ('Mint', 'Peach', 'Pink', 'Sky', 'Lilac', 'Butter')),
  personality  text check (personality in ('Anxious', 'Overachiever', 'Dreamy', 'Chatty', 'Homebody', 'Chill')),
  description  text check (description is null or char_length(description) <= 200),

  -- Partnership projects: who, what and which cast members
  company      text check (company is null or char_length(company) between 1 and 120),
  interest     text check (interest in ('Brand partnership', 'Licensing', 'Manufacturing', 'Something else')),
  cast_members text[] not null default '{}',
  message      text check (message is null or char_length(message) <= 2000),
  -- Set by the tsayvish team (Table Editor), never by the person who submitted it.
  status       text check (status in ('submitted', 'in_review', 'approved', 'declined')),

  created_at   timestamptz not null default now(),

  constraint projects_original_fields check (
    type <> 'original' or (kind is not null and color is not null and personality is not null)),
  constraint projects_partnership_fields check (
    type <> 'partnership' or (company is not null and interest is not null
                              and cardinality(cast_members) >= 1 and status is not null))
);

create index if not exists projects_owner_id_idx on public.projects (owner_id, created_at desc);

alter table public.projects enable row level security;

drop policy if exists "Projects: read own" on public.projects;
create policy "Projects: read own" on public.projects
  for select using ((select auth.uid()) = owner_id);

drop policy if exists "Projects: create own" on public.projects;
create policy "Projects: create own" on public.projects
  for insert with check (
    (select auth.uid()) = owner_id
    and ((type = 'original' and status is null) or (type = 'partnership' and status = 'submitted')));

drop policy if exists "Projects: update own" on public.projects;
create policy "Projects: update own" on public.projects
  for update using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "Projects: delete own" on public.projects;
create policy "Projects: delete own" on public.projects
  for delete using ((select auth.uid()) = owner_id);

-- People may edit their project's details, but not its owner, type or review status.
revoke update on public.projects from anon, authenticated;
grant update (name, kind, color, personality, description, company, interest, cast_members, message)
  on public.projects to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Infrastructure switched on for a project.
-- People can only set 'off' or 'requested'. Your team marks a service
-- 'active' from the Supabase Table Editor once it's actually set up.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.project_services (
  project_id uuid not null references public.projects (id) on delete cascade,
  service    text not null check (service in (
               'Trademark filing', 'Likeness lock', 'Storefront', 'Payments',
               'Physical goods', 'Audience tools', 'Media budget', 'Live events')),
  status     text not null default 'requested' check (status in ('off', 'requested', 'active')),
  updated_at timestamptz not null default now(),
  primary key (project_id, service)
);

alter table public.project_services enable row level security;

drop policy if exists "Services: read own" on public.project_services;
create policy "Services: read own" on public.project_services
  for select using (exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists "Services: request own" on public.project_services;
create policy "Services: request own" on public.project_services
  for insert with check (
    status in ('off', 'requested') and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists "Services: change own unless active" on public.project_services;
create policy "Services: change own unless active" on public.project_services
  for update
  using (status <> 'active' and exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (status in ('off', 'requested'));
