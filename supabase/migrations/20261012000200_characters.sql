-- ═════════════════════════════════════════════════════════════════════════
-- Characters as full records: style guide, asset library, version history,
-- and listings that stay in sync with the character. Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

-- Who may see / change a project. (Teams extend these in a later migration.)
create or replace function public.can_view_project(pid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.projects p where p.id = pid and p.owner_id = auth.uid()) $$;

create or replace function public.can_edit_project(pid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.projects p where p.id = pid and p.owner_id = auth.uid()) $$;

grant execute on function public.can_view_project(uuid), public.can_edit_project(uuid) to authenticated;

-- Style guide: colors, voice notes, catchphrases, do's and don'ts.
alter table public.projects add column if not exists style_guide jsonb not null default '{}';
alter table public.projects add column if not exists updated_at timestamptz not null default now();
alter table public.projects drop constraint if exists projects_style_guide_size;
alter table public.projects add constraint projects_style_guide_size check (pg_column_size(style_guide) <= 20000);
grant update (style_guide) on public.projects to authenticated;

-- ── Asset library ──
create table if not exists public.character_assets (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  added_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null default 'reference' check (kind in ('reference', 'turnaround', 'expression', 'logo', 'other')),
  label      text check (label is null or char_length(label) <= 80),
  url        text not null check (url like '%/storage/v1/object/public/character-images/%'),
  created_at timestamptz not null default now()
);
create index if not exists character_assets_project_idx on public.character_assets (project_id, created_at desc);
alter table public.character_assets enable row level security;
drop policy if exists "Assets: view" on public.character_assets;
create policy "Assets: view" on public.character_assets for select to authenticated using (public.can_view_project(project_id));
drop policy if exists "Assets: add" on public.character_assets;
create policy "Assets: add" on public.character_assets for insert to authenticated
  with check (added_by = (select auth.uid()) and public.can_edit_project(project_id));
drop policy if exists "Assets: edit" on public.character_assets;
create policy "Assets: edit" on public.character_assets for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
drop policy if exists "Assets: remove" on public.character_assets;
create policy "Assets: remove" on public.character_assets for delete to authenticated using (public.can_edit_project(project_id));

-- ── Version history: a snapshot of the character before each change ──
create table if not exists public.character_versions (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  snapshot   jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists character_versions_project_idx on public.character_versions (project_id, created_at desc);
alter table public.character_versions enable row level security;
drop policy if exists "Versions: view" on public.character_versions;
create policy "Versions: view" on public.character_versions for select to authenticated using (public.can_view_project(project_id));
revoke insert, update, delete on public.character_versions from anon, authenticated;

create or replace function public.track_character_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.type <> 'original' then return new; end if;
  if (new.name, new.kind, new.color, new.personality, new.description, new.image_url, new.style_guide)
     is not distinct from (old.name, old.kind, old.color, old.personality, old.description, old.image_url, old.style_guide) then
    return new;
  end if;
  new.updated_at := now();
  insert into public.character_versions (project_id, snapshot, changed_by)
  values (old.id, jsonb_build_object(
    'name', old.name, 'kind', old.kind, 'color', old.color, 'personality', old.personality,
    'description', old.description, 'image_url', old.image_url, 'style_guide', old.style_guide,
    'details', old.details, 'saved_at', old.updated_at), auth.uid());
  return new;
end;
$$;
drop trigger if exists track_character_change on public.projects;
create trigger track_character_change before update on public.projects
  for each row execute procedure public.track_character_change();

-- Restore an earlier version (the restore itself is saved as a new version).
create or replace function public.restore_character_version(version uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v record;
begin
  select * into v from public.character_versions where id = version;
  if v.id is null or not public.can_edit_project(v.project_id) then raise exception 'Version not found'; end if;
  update public.projects set
    name = v.snapshot ->> 'name', kind = v.snapshot ->> 'kind', color = v.snapshot ->> 'color',
    personality = v.snapshot ->> 'personality', description = v.snapshot ->> 'description',
    image_url = v.snapshot ->> 'image_url', style_guide = coalesce(v.snapshot -> 'style_guide', '{}')
  where id = v.project_id;
end;
$$;
revoke all on function public.restore_character_version(uuid) from public, anon;
grant execute on function public.restore_character_version(uuid) to authenticated;

-- ── Listings follow the character: when the character changes, its listings update too ──
create or replace function public.sync_character_listings()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.type = 'original' and (new.name, new.kind, new.color, new.personality, new.image_url)
     is distinct from (old.name, old.kind, old.color, old.personality, old.image_url) then
    update public.listings set character_info = jsonb_strip_nulls(jsonb_build_object(
      'name', new.name, 'kind', new.kind, 'color', new.color, 'personality', new.personality, 'image_url', new.image_url))
    where project_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists sync_character_listings on public.projects;
create trigger sync_character_listings after update on public.projects
  for each row execute procedure public.sync_character_listings();
