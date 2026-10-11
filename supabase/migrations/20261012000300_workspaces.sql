-- ═════════════════════════════════════════════════════════════════════════
-- Teams: workspaces whose members share characters. Roles: owner, editor, viewer.
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  token        text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  role         text not null default 'editor' check (role in ('editor', 'viewer')),
  email        text check (email is null or (char_length(email) <= 120 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_by  uuid references auth.users (id) on delete set null,
  accepted_at  timestamptz
);
create index if not exists workspace_invites_ws_idx on public.workspace_invites (workspace_id, created_at desc);

-- The signed-in person's role in a workspace, or null.
create or replace function public.workspace_role(ws uuid)
returns text language sql stable security definer set search_path = ''
as $$ select role from public.workspace_members where workspace_id = ws and user_id = auth.uid() $$;
grant execute on function public.workspace_role(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

drop policy if exists "Workspaces: members read" on public.workspaces;
create policy "Workspaces: members read" on public.workspaces for select to authenticated
  using (public.workspace_role(id) is not null);
drop policy if exists "Workspaces: create" on public.workspaces;
create policy "Workspaces: create" on public.workspaces for insert to authenticated
  with check (created_by = (select auth.uid()));
drop policy if exists "Workspaces: owners rename" on public.workspaces;
create policy "Workspaces: owners rename" on public.workspaces for update to authenticated
  using (public.workspace_role(id) = 'owner') with check (public.workspace_role(id) = 'owner');
drop policy if exists "Workspaces: owners delete" on public.workspaces;
create policy "Workspaces: owners delete" on public.workspaces for delete to authenticated
  using (public.workspace_role(id) = 'owner');
revoke update on public.workspaces from anon, authenticated;
grant update (name) on public.workspaces to authenticated;

-- The creator becomes the first owner.
create or replace function public.add_workspace_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role) values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists add_workspace_owner on public.workspaces;
create trigger add_workspace_owner after insert on public.workspaces
  for each row execute procedure public.add_workspace_owner();

drop policy if exists "Members: teammates read" on public.workspace_members;
create policy "Members: teammates read" on public.workspace_members for select to authenticated
  using (public.workspace_role(workspace_id) is not null);
drop policy if exists "Members: owners change roles" on public.workspace_members;
create policy "Members: owners change roles" on public.workspace_members for update to authenticated
  using (public.workspace_role(workspace_id) = 'owner' and user_id <> (select auth.uid()))
  with check (public.workspace_role(workspace_id) = 'owner');
drop policy if exists "Members: owners remove, anyone leaves" on public.workspace_members;
create policy "Members: owners remove, anyone leaves" on public.workspace_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.workspace_role(workspace_id) = 'owner');
revoke insert on public.workspace_members from anon, authenticated;
revoke update on public.workspace_members from anon, authenticated;
grant update (role) on public.workspace_members to authenticated;

-- A workspace always keeps at least one owner.
create or replace function public.keep_an_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare ws uuid := coalesce(old.workspace_id, new.workspace_id);
begin
  if exists (select 1 from public.workspaces w where w.id = ws)
     and not exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.role = 'owner') then
    raise exception 'A workspace needs at least one owner';
  end if;
  return null;
end;
$$;
drop trigger if exists keep_an_owner on public.workspace_members;
create trigger keep_an_owner after update or delete on public.workspace_members
  for each row execute procedure public.keep_an_owner();

drop policy if exists "Invites: owners manage" on public.workspace_invites;
create policy "Invites: owners manage" on public.workspace_invites for all to authenticated
  using (public.workspace_role(workspace_id) = 'owner')
  with check (public.workspace_role(workspace_id) = 'owner' and created_by = (select auth.uid()));

-- What an invite link is for, before accepting it.
create or replace function public.invite_preview(invite_token text)
returns table (workspace_name text, role text, invited_by text, expired boolean, used boolean)
language sql stable security definer set search_path = ''
as $$
  select w.name, i.role, coalesce(p.full_name, 'A tsayvish member'), i.expires_at < now(), i.accepted_at is not null
  from public.workspace_invites i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.created_by
  where i.token = invite_token
$$;
revoke all on function public.invite_preview(text) from public, anon;
grant execute on function public.invite_preview(text) to authenticated;

create or replace function public.accept_workspace_invite(invite_token text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare i record;
begin
  select * into i from public.workspace_invites where token = invite_token for update;
  if i.id is null then raise exception 'This invite link isn’t valid'; end if;
  if i.accepted_at is not null then raise exception 'This invite has already been used'; end if;
  if i.expires_at < now() then raise exception 'This invite has expired. Ask for a new link.'; end if;
  if i.email is not null and lower(i.email) <> lower(coalesce(auth.email(), '')) then
    raise exception 'This invite was sent to a different email address';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (i.workspace_id, auth.uid(), i.role)
  on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set accepted_by = auth.uid(), accepted_at = now() where id = i.id;
  return i.workspace_id;
end;
$$;
revoke all on function public.accept_workspace_invite(text) from public, anon;
grant execute on function public.accept_workspace_invite(text) to authenticated;

-- ── Characters (projects) can belong to a workspace ──
alter table public.projects add column if not exists workspace_id uuid references public.workspaces (id) on delete set null;
create index if not exists projects_workspace_idx on public.projects (workspace_id, created_at desc) where workspace_id is not null;
grant update (workspace_id) on public.projects to authenticated;

create or replace function public.can_view_project(pid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.projects p where p.id = pid and (
    p.owner_id = auth.uid()
    or (p.workspace_id is not null and public.workspace_role(p.workspace_id) is not null)))
$$;

create or replace function public.can_edit_project(pid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.projects p where p.id = pid and (
    p.owner_id = auth.uid()
    or (p.workspace_id is not null and public.workspace_role(p.workspace_id) in ('owner', 'editor'))))
$$;

drop policy if exists "Projects: read own" on public.projects;
drop policy if exists "Projects: read own or team" on public.projects;
create policy "Projects: read own or team" on public.projects for select using (
  (select auth.uid()) = owner_id
  or (workspace_id is not null and public.workspace_role(workspace_id) is not null));

drop policy if exists "Projects: create own" on public.projects;
create policy "Projects: create own" on public.projects for insert with check (
  (select auth.uid()) = owner_id
  and ((type = 'original' and status is null) or (type = 'partnership' and status = 'submitted'))
  and (workspace_id is null or public.workspace_role(workspace_id) in ('owner', 'editor')));

drop policy if exists "Projects: update own" on public.projects;
drop policy if exists "Projects: update own or team" on public.projects;
create policy "Projects: update own or team" on public.projects for update
  using ((select auth.uid()) = owner_id
         or (workspace_id is not null and public.workspace_role(workspace_id) in ('owner', 'editor')))
  with check (workspace_id is null or public.workspace_role(workspace_id) in ('owner', 'editor')
              or (select auth.uid()) = owner_id);

drop policy if exists "Projects: delete own" on public.projects;
create policy "Projects: delete own" on public.projects for delete using (
  (select auth.uid()) = owner_id
  or (workspace_id is not null and public.workspace_role(workspace_id) = 'owner'));

-- Only the character's creator can move it into (or out of) a workspace, and only one they can edit.
create or replace function public.guard_project_workspace()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id and auth.uid() is not null then
    if auth.uid() <> old.owner_id then raise exception 'Only the person who created this can move it'; end if;
    if new.workspace_id is not null and public.workspace_role(new.workspace_id) not in ('owner', 'editor') then
      raise exception 'You can only move it into a workspace you can edit';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_project_workspace on public.projects;
create trigger guard_project_workspace before update on public.projects
  for each row execute procedure public.guard_project_workspace();

-- Services follow the same access as their project.
drop policy if exists "Services: read own" on public.project_services;
create policy "Services: read own" on public.project_services for select using (public.can_view_project(project_id));
drop policy if exists "Services: add own" on public.project_services;
create policy "Services: add own" on public.project_services for insert with check (public.can_edit_project(project_id));
drop policy if exists "Services: update own" on public.project_services;
create policy "Services: update own" on public.project_services for update
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

-- Teammates can see each other's profile.
drop policy if exists "Profiles: teammates read" on public.profiles;
create policy "Profiles: teammates read" on public.profiles for select to authenticated using (
  exists (select 1 from public.workspace_members a
          join public.workspace_members b on b.workspace_id = a.workspace_id
          where a.user_id = (select auth.uid()) and b.user_id = profiles.id));
