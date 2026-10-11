-- ═════════════════════════════════════════════════════════════════════════
-- AI Studio: every character gets a media library, scripts and AI generations
-- (images, voiceovers, video clips, talking clips, assembled videos).
-- Generation runs on the server (app/api/studio); the database tracks jobs,
-- enforces access, rate limits and a monthly spend limit per person.
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

-- Turns text into a uuid, or null if it isn't one (safe inside storage policies).
create or replace function public.try_uuid(t text)
returns uuid language plpgsql immutable
as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

-- ── Storage: a private bucket, files at <character id>/<name> ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-media', 'studio-media', false, 52428800, array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/flac',
  'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Studio media: team views" on storage.objects;
create policy "Studio media: team views" on storage.objects for select to authenticated
  using (bucket_id = 'studio-media' and public.can_view_project(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "Studio media: editors upload" on storage.objects;
create policy "Studio media: editors upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-media' and public.can_edit_project(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "Studio media: editors replace" on storage.objects;
create policy "Studio media: editors replace" on storage.objects for update to authenticated
  using (bucket_id = 'studio-media' and public.can_edit_project(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "Studio media: editors remove" on storage.objects;
create policy "Studio media: editors remove" on storage.objects for delete to authenticated
  using (bucket_id = 'studio-media' and public.can_edit_project(public.try_uuid((storage.foldername(name))[1])));

-- ── Generation jobs ──
create table if not exists public.studio_generations (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  created_by          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool                text not null check (tool in ('image', 'video', 'voice', 'talking', 'assemble')),
  model               text not null check (char_length(model) <= 120),
  prompt              text check (prompt is null or char_length(prompt) <= 5000),
  params              jsonb not null default '{}'::jsonb,
  inputs              jsonb not null default '[]'::jsonb,
  status              text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  provider            text not null default 'fal',
  provider_request_id text,
  provider_meta       jsonb not null default '{}'::jsonb,   -- status/result URLs from the provider
  error               text check (error is null or char_length(error) <= 1000),
  cost_cents          integer not null default 0 check (cost_cents >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  finished_at         timestamptz
);
alter table public.studio_generations add column if not exists provider_meta jsonb not null default '{}'::jsonb;
create index if not exists studio_generations_project_idx on public.studio_generations (project_id, created_at desc);
create index if not exists studio_generations_user_month_idx on public.studio_generations (created_by, created_at);
alter table public.studio_generations enable row level security;
drop policy if exists "Generations: team views" on public.studio_generations;
create policy "Generations: team views" on public.studio_generations for select to authenticated
  using (public.can_view_project(project_id));
drop policy if exists "Generations: staff read" on public.studio_generations;
create policy "Generations: staff read" on public.studio_generations for select to authenticated using (public.is_staff());
-- All writes go through the functions below.
revoke insert, update, delete on public.studio_generations from anon, authenticated;

-- ── Media library ──
create table if not exists public.studio_media (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  added_by      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('image', 'audio', 'video')),
  source        text not null default 'upload' check (source in ('upload', 'generated')),
  label         text check (label is null or char_length(label) <= 120),
  path          text not null check (char_length(path) <= 300),
  mime          text check (mime is null or char_length(mime) <= 80),
  bytes         bigint check (bytes is null or bytes >= 0),
  duration_ms   integer check (duration_ms is null or duration_ms >= 0),
  generation_id uuid references public.studio_generations (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (path)
);
create index if not exists studio_media_project_idx on public.studio_media (project_id, created_at desc);
alter table public.studio_media enable row level security;
drop policy if exists "Media: team views" on public.studio_media;
create policy "Media: team views" on public.studio_media for select to authenticated using (public.can_view_project(project_id));
drop policy if exists "Media: editors upload" on public.studio_media;
create policy "Media: editors upload" on public.studio_media for insert to authenticated
  with check (added_by = (select auth.uid()) and source = 'upload' and generation_id is null
              and public.can_edit_project(project_id) and path like project_id::text || '/%');
drop policy if exists "Media: editors remove" on public.studio_media;
create policy "Media: editors remove" on public.studio_media for delete to authenticated using (public.can_edit_project(project_id));
drop policy if exists "Media: editors rename" on public.studio_media;
create policy "Media: editors rename" on public.studio_media for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
revoke update on public.studio_media from authenticated;
grant update (label, duration_ms) on public.studio_media to authenticated;

-- ── Scripts: a title and a list of scenes ──
-- Each scene: { id, shot, line, voice, clip_media, voice_media }
create table if not exists public.studio_scripts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'Untitled script' check (char_length(title) between 1 and 120),
  scenes      jsonb not null default '[]'::jsonb
                check (jsonb_typeof(scenes) = 'array' and jsonb_array_length(scenes) <= 60 and pg_column_size(scenes) < 200000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists studio_scripts_project_idx on public.studio_scripts (project_id, updated_at desc);
alter table public.studio_scripts enable row level security;
drop policy if exists "Scripts: team views" on public.studio_scripts;
create policy "Scripts: team views" on public.studio_scripts for select to authenticated using (public.can_view_project(project_id));
drop policy if exists "Scripts: editors add" on public.studio_scripts;
create policy "Scripts: editors add" on public.studio_scripts for insert to authenticated
  with check (created_by = (select auth.uid()) and public.can_edit_project(project_id));
drop policy if exists "Scripts: editors edit" on public.studio_scripts;
create policy "Scripts: editors edit" on public.studio_scripts for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
drop policy if exists "Scripts: editors remove" on public.studio_scripts;
create policy "Scripts: editors remove" on public.studio_scripts for delete to authenticated using (public.can_edit_project(project_id));

create or replace function public.touch_updated_at()
returns trigger language plpgsql
as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists touch_updated_at on public.studio_scripts;
create trigger touch_updated_at before update on public.studio_scripts for each row execute procedure public.touch_updated_at();
drop trigger if exists touch_updated_at on public.studio_generations;
create trigger touch_updated_at before update on public.studio_generations for each row execute procedure public.touch_updated_at();

-- Rate limits and bans (see the safety migration).
drop trigger if exists rate_limit on public.studio_generations;
create trigger rate_limit before insert on public.studio_generations
  for each row execute procedure public.rate_limit('created_by', '1 hour', '60');
drop trigger if exists member_can_create on public.studio_generations;
create trigger member_can_create before insert on public.studio_generations
  for each row execute procedure public.member_can_create('verified');
drop trigger if exists rate_limit on public.studio_media;
create trigger rate_limit before insert on public.studio_media
  for each row execute procedure public.rate_limit('added_by', '1 hour', '300');
drop trigger if exists member_can_create on public.studio_media;
create trigger member_can_create before insert on public.studio_media
  for each row execute procedure public.member_can_create();

-- ── Monthly spend limit (in cents of provider cost) ──
create table if not exists public.studio_limits (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  monthly_cents integer not null check (monthly_cents >= 0),
  updated_at    timestamptz not null default now()
);
alter table public.studio_limits enable row level security;
drop policy if exists "Studio limits: own or staff" on public.studio_limits;
create policy "Studio limits: own or staff" on public.studio_limits for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());
revoke insert, update, delete on public.studio_limits from anon, authenticated;

-- Default allowance for everyone: $10 of generation a month. Change the number here.
create or replace function public.studio_default_monthly_cents()
returns integer language sql immutable as $$ select 1000 $$;

create or replace function public.studio_usage(uid uuid default auth.uid())
returns table (used_cents integer, limit_cents integer)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce((select sum(g.cost_cents)::integer from public.studio_generations g
              where g.created_by = uid and g.created_at >= date_trunc('month', now())
                and not (g.status in ('failed', 'canceled') and g.provider_request_id is null)), 0),
    coalesce((select l.monthly_cents from public.studio_limits l where l.user_id = uid), public.studio_default_monthly_cents())
  where uid = auth.uid() or public.is_staff()
$$;
grant execute on function public.studio_usage(uuid) to authenticated;

-- ── Starting, tracking and finishing a generation ──
create or replace function public.studio_start_generation(
  p_project uuid, p_tool text, p_model text, p_prompt text, p_params jsonb, p_inputs jsonb, p_cost_cents integer)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare used integer; cap integer; new_id uuid;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if not public.can_edit_project(p_project) then raise exception 'You can only generate for characters you can edit.'; end if;
  if coalesce(p_cost_cents, 0) < 0 then raise exception 'Invalid cost.'; end if;
  select u.used_cents, u.limit_cents into used, cap from public.studio_usage(auth.uid()) u;
  if used + coalesce(p_cost_cents, 0) > cap then
    raise exception 'This would go over your monthly AI Studio limit ($% of $% used). Ask the tsayvish team to raise it.',
      to_char(used / 100.0, 'FM999990.00'), to_char(cap / 100.0, 'FM999990.00')
      using hint = 'over_limit';
  end if;
  insert into public.studio_generations (project_id, created_by, tool, model, prompt, params, inputs, cost_cents)
  values (p_project, auth.uid(), p_tool, p_model, nullif(trim(p_prompt), ''), coalesce(p_params, '{}'::jsonb), coalesce(p_inputs, '[]'::jsonb), coalesce(p_cost_cents, 0))
  returning id into new_id;
  return new_id;
end;
$$;

drop function if exists public.studio_mark_submitted(uuid, text);
create or replace function public.studio_mark_submitted(p_id uuid, p_request_id text, p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if pg_column_size(p_meta) > 4000 then raise exception 'Too much detail.'; end if;
  update public.studio_generations set status = 'running', provider_request_id = left(p_request_id, 200), provider_meta = coalesce(p_meta, '{}'::jsonb)
  where id = p_id and created_by = auth.uid() and status = 'queued' and provider_request_id is null;
  if not found then raise exception 'Generation not found.'; end if;
end;
$$;

-- Marks a job failed or canceled. Anyone who can edit the character may cancel.
create or replace function public.studio_end_generation(p_id uuid, p_status text, p_error text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare g public.studio_generations;
begin
  if p_status not in ('failed', 'canceled') then raise exception 'Invalid status.'; end if;
  select * into g from public.studio_generations where id = p_id;
  if g.id is null or not public.can_edit_project(g.project_id) then raise exception 'Generation not found.'; end if;
  update public.studio_generations set status = p_status, error = left(p_error, 1000), finished_at = now()
  where id = p_id and status in ('queued', 'running');
end;
$$;

-- Records the finished files (already uploaded to studio-media) and, if the job came
-- from a script scene, links the result into that scene. Runs once per job.
-- p_outputs: [{ "path", "kind", "mime", "bytes", "duration_ms" }]
create or replace function public.studio_complete_generation(p_id uuid, p_outputs jsonb)
returns setof public.studio_media language plpgsql security definer set search_path = ''
as $$
declare g public.studio_generations; o jsonb; m public.studio_media; first_media uuid; role text; sid text; scr uuid;
begin
  select * into g from public.studio_generations where id = p_id for update;
  if g.id is null or not public.can_edit_project(g.project_id) then raise exception 'Generation not found.'; end if;
  if g.status not in ('queued', 'running') then
    return query select * from public.studio_media where generation_id = p_id order by created_at;
    return;
  end if;
  if jsonb_typeof(p_outputs) <> 'array' or jsonb_array_length(p_outputs) = 0 or jsonb_array_length(p_outputs) > 8 then
    raise exception 'No output files.';
  end if;
  for o in select * from jsonb_array_elements(p_outputs) loop
    if (o->>'path') not like g.project_id::text || '/%' then raise exception 'Output must be stored with the character.'; end if;
    insert into public.studio_media (project_id, added_by, kind, source, label, path, mime, bytes, duration_ms, generation_id)
    values (g.project_id, g.created_by, o->>'kind', 'generated', left(coalesce(g.params->>'label', g.prompt, g.tool), 120),
            o->>'path', o->>'mime', nullif(o->>'bytes', '')::bigint, nullif(o->>'duration_ms', '')::integer, g.id)
    on conflict (path) do update set generation_id = excluded.generation_id
    returning * into m;
    first_media := coalesce(first_media, m.id);
    return next m;
  end loop;
  update public.studio_generations set status = 'succeeded', error = null, finished_at = now() where id = p_id;

  role := g.params->>'scene_role';
  sid := g.params->>'scene_id';
  scr := public.try_uuid(g.params->>'script_id');
  if role in ('clip', 'voice') and sid is not null and scr is not null then
    update public.studio_scripts s
       set scenes = (select coalesce(jsonb_agg(case when e->>'id' = sid then e || jsonb_build_object(role || '_media', first_media::text) else e end order by ord), '[]'::jsonb)
                       from jsonb_array_elements(s.scenes) with ordinality t(e, ord))
     where s.id = scr and s.project_id = g.project_id;
  end if;
end;
$$;

grant execute on function public.studio_start_generation(uuid, text, text, text, jsonb, jsonb, integer) to authenticated;
grant execute on function public.studio_mark_submitted(uuid, text, jsonb) to authenticated;
grant execute on function public.studio_end_generation(uuid, text, text) to authenticated;
grant execute on function public.studio_complete_generation(uuid, jsonb) to authenticated;

-- ── Staff can change someone's monthly allowance ──
create or replace function public.admin_set_studio_limit(p_user uuid, p_cents integer)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  if p_cents is null or p_cents < 0 then raise exception 'Enter an amount of $0 or more.'; end if;
  insert into public.studio_limits (user_id, monthly_cents) values (p_user, p_cents)
  on conflict (user_id) do update set monthly_cents = excluded.monthly_cents, updated_at = now();
  perform public.log_admin_action('studio_limit', 'user', p_user::text, jsonb_build_object('monthly_cents', p_cents));
end;
$$;
grant execute on function public.admin_set_studio_limit(uuid, integer) to authenticated;
