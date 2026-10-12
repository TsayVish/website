-- ═════════════════════════════════════════════════════════════════════════
-- Content manager and AI writing.
--  • ai_keys: each person's own Claude (Anthropic) or OpenAI API key, encrypted by
--    the server. Clients can see which keys exist, never the keys themselves.
--  • ai_runs: every AI writing request. Without their own key, people pay from
--    their AI Studio credits (free for billing-off members).
--  • content_items: ideas, drafts and planned posts for each character, moving
--    Idea → Draft → Ready → Scheduled → Posted, kept in step with Social posts.
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

-- ── Personal API keys ──
create table if not exists public.ai_keys (
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null check (provider in ('anthropic', 'openai')),
  key_enc     text not null,
  hint        text check (hint is null or char_length(hint) <= 20),
  model       text check (model is null or char_length(model) <= 100),
  is_default  boolean not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.ai_keys enable row level security;
revoke all on public.ai_keys from anon, authenticated;
grant select (user_id, provider, hint, model, is_default, verified_at, created_at) on public.ai_keys to authenticated;
drop policy if exists "AI keys: own" on public.ai_keys;
create policy "AI keys: own" on public.ai_keys for select to authenticated using (user_id = (select auth.uid()));

-- Saves (or replaces) one of your keys. The key arrives already encrypted by the server.
create or replace function public.ai_save_key(p_provider text, p_key_enc text, p_hint text, p_model text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if p_provider not in ('anthropic', 'openai') then raise exception 'Unknown provider.'; end if;
  insert into public.ai_keys (user_id, provider, key_enc, hint, model, is_default, verified_at)
  values (auth.uid(), p_provider, p_key_enc, left(p_hint, 20), left(p_model, 100),
          not exists (select 1 from public.ai_keys where user_id = auth.uid() and provider <> p_provider), now())
  on conflict (user_id, provider) do update set key_enc = excluded.key_enc, hint = excluded.hint, model = excluded.model, verified_at = now();
end;
$$;

create or replace function public.ai_set_key_options(p_provider text, p_model text, p_default boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.ai_keys where user_id = auth.uid() and provider = p_provider) then raise exception 'Add that key first.'; end if;
  update public.ai_keys set model = coalesce(left(nullif(btrim(p_model), ''), 100), model) where user_id = auth.uid() and provider = p_provider;
  if p_default then
    update public.ai_keys set is_default = (provider = p_provider) where user_id = auth.uid();
  end if;
end;
$$;

create or replace function public.ai_delete_key(p_provider text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.ai_keys where user_id = auth.uid() and provider = p_provider;
  -- Keep one default if a key is left.
  update public.ai_keys set is_default = true
  where user_id = auth.uid() and not exists (select 1 from public.ai_keys where user_id = auth.uid() and is_default);
end;
$$;

-- For the server only: someone's encrypted key, to make a request on their behalf.
create or replace function public.ai_key_secret(p_secret text, p_user uuid)
returns table (provider text, key_enc text, model text, is_default boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.server_secret_ok(p_secret) then raise exception 'Not allowed.'; end if;
  return query select k.provider, k.key_enc, k.model, k.is_default from public.ai_keys k where k.user_id = p_user
    order by k.is_default desc, k.created_at;
end;
$$;

-- ── AI writing usage (and charges when tsayvish's own key was used) ──
create table if not exists public.ai_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,
  task          text not null check (char_length(task) <= 40),
  provider      text not null check (provider in ('anthropic', 'openai')),
  model         text not null check (char_length(model) <= 100),
  own_key       boolean not null,
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  price_cents   integer not null default 0 check (price_cents >= 0),
  created_at    timestamptz not null default now()
);
create index if not exists ai_runs_user_idx on public.ai_runs (user_id, created_at desc);
alter table public.ai_runs enable row level security;
revoke all on public.ai_runs from anon, authenticated;
grant select on public.ai_runs to authenticated;
drop policy if exists "AI runs: own or staff" on public.ai_runs;
create policy "AI runs: own or staff" on public.ai_runs for select to authenticated
  using (user_id = (select auth.uid()) or public.staff_can(user_id));

-- Records a finished request for the signed-in person and charges their credits when
-- tsayvish's key was used (unless billing is off for them). Returns what was charged.
create or replace function public.ai_record_run(
  p_project uuid, p_task text, p_provider text, p_model text, p_own_key boolean,
  p_input_tokens integer, p_output_tokens integer, p_cost_cents numeric)
returns integer language plpgsql security definer set search_path = ''
as $$
declare price integer := 0; rid uuid;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if p_project is not null and not public.can_view_project(p_project) then raise exception 'Character not found.'; end if;
  if not coalesce(p_own_key, false) and not public.is_billing_exempt(auth.uid()) then
    price := greatest(1, ceil(greatest(coalesce(p_cost_cents, 0), 0) * public.credit_markup()))::integer;
  end if;
  insert into public.ai_runs (user_id, project_id, task, provider, model, own_key, input_tokens, output_tokens, price_cents)
  values (auth.uid(), p_project, left(p_task, 40), p_provider, left(p_model, 100), coalesce(p_own_key, false),
          greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0), price)
  returning id into rid;
  if price > 0 then
    insert into public.credit_ledger (user_id, kind, amount_cents, note, created_by)
    values (auth.uid(), 'charge', -price, left('AI writing: ' || p_task, 300), auth.uid());
  end if;
  return price;
end;
$$;

-- ── Content items ──
create table if not exists public.content_items (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  title          text not null default '' check (char_length(title) <= 200),
  body           text not null default '' check (char_length(body) <= 20000),
  caption        text not null default '' check (char_length(caption) <= 5000),
  format         text not null default 'post' check (format in ('post', 'reel', 'short', 'story', 'carousel', 'episode', 'other')),
  status         text not null default 'idea' check (status in ('idea', 'draft', 'ready', 'scheduled', 'posted', 'archived')),
  platforms      text[] not null default '{}' check (platforms <@ array['instagram', 'facebook', 'youtube', 'tiktok']::text[]),
  tags           text[] not null default '{}' check (cardinality(tags) <= 20),
  media_id       uuid references public.studio_media (id) on delete set null,
  script_id      uuid references public.studio_scripts (id) on delete set null,
  social_post_id uuid references public.social_posts (id) on delete set null,
  planned_at     timestamptz,
  position       double precision not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists content_items_project_idx on public.content_items (project_id, status, position);
create index if not exists content_items_planned_idx on public.content_items (planned_at) where planned_at is not null;
create index if not exists content_items_post_idx on public.content_items (social_post_id) where social_post_id is not null;
alter table public.content_items enable row level security;
revoke all on public.content_items from anon, authenticated;
grant select, delete on public.content_items to authenticated;
grant insert (project_id, title, body, caption, format, status, platforms, tags, media_id, script_id, planned_at, position) on public.content_items to authenticated;
grant update (title, body, caption, format, status, platforms, tags, media_id, script_id, planned_at, position, updated_at) on public.content_items to authenticated;
drop policy if exists "Content: view" on public.content_items;
create policy "Content: view" on public.content_items for select to authenticated using (public.can_view_project(project_id));
drop policy if exists "Content: add" on public.content_items;
create policy "Content: add" on public.content_items for insert to authenticated
  with check (public.can_edit_project(project_id) and not public.is_banned(auth.uid())
              and exists (select 1 from public.projects p where p.id = project_id and p.type = 'original'));
drop policy if exists "Content: edit" on public.content_items;
create policy "Content: edit" on public.content_items for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
drop policy if exists "Content: delete" on public.content_items;
create policy "Content: delete" on public.content_items for delete to authenticated using (public.can_edit_project(project_id));

-- Media and scripts must belong to the same character.
create or replace function public.content_items_check()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.media_id is not null and not exists (select 1 from public.studio_media m where m.id = new.media_id and m.project_id = new.project_id) then
    raise exception 'That file isn’t in this character’s library.';
  end if;
  if new.script_id is not null and not exists (select 1 from public.studio_scripts s where s.id = new.script_id and s.project_id = new.project_id) then
    raise exception 'That script belongs to a different character.';
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  -- Too many items for one character usually means a runaway script.
  if tg_op = 'INSERT' and (select count(*) from public.content_items where project_id = new.project_id) >= 2000 then
    raise exception 'This character has 2,000 content items. Archive or delete some first.';
  end if;
  return new;
end;
$$;
drop trigger if exists content_items_check on public.content_items;
create trigger content_items_check before insert or update on public.content_items
  for each row execute procedure public.content_items_check();

-- Links an item to a Social post that was just made from it.
create or replace function public.content_link_post(p_item uuid, p_post uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare ip uuid; pp uuid; when_at timestamptz; st text;
begin
  select project_id into ip from public.content_items where id = p_item;
  select project_id, scheduled_at, status into pp, when_at, st from public.social_posts where id = p_post;
  if ip is null or pp is null or ip <> pp or not public.can_edit_project(ip) then raise exception 'Not found.'; end if;
  update public.content_items set social_post_id = p_post, planned_at = when_at,
    status = case when st in ('posted', 'partial') then 'posted' else 'scheduled' end, updated_at = now()
  where id = p_item;
end;
$$;

-- Keeps linked items in step with their Social post.
create or replace function public.content_follow_post()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.content_items set
    planned_at = new.scheduled_at,
    status = case new.status
      when 'posted' then 'posted' when 'partial' then 'posted'
      when 'scheduled' then 'scheduled' when 'publishing' then 'scheduled'
      else 'ready' end,
    updated_at = now()
  where social_post_id = new.id and status <> 'archived';
  return new;
end;
$$;
drop trigger if exists content_follow_post on public.social_posts;
create trigger content_follow_post after update of status, scheduled_at on public.social_posts
  for each row execute procedure public.content_follow_post();

-- Moves a scheduled Social post to a new time (with a fresh file link). Only before anything has gone out.
create or replace function public.social_reschedule(p_post uuid, p_when timestamptz, p_media_url text)
returns void language plpgsql security definer set search_path = ''
as $$
declare pid uuid; path text;
begin
  select p.project_id, m.path into pid, path from public.social_posts p left join public.studio_media m on m.id = p.media_id where p.id = p_post;
  if pid is null or not public.can_edit_project(pid) then raise exception 'Post not found.'; end if;
  if exists (select 1 from public.social_post_targets where post_id = p_post and status <> 'pending' and status <> 'canceled') then
    raise exception 'This post has already started going out.';
  end if;
  if p_when < now() or p_when > now() + interval '60 days' then raise exception 'Pick a time in the next 60 days.'; end if;
  if path is null or position('/storage/v1/object/sign/studio-media/' || path || '?' in coalesce(p_media_url, '')) = 0 then
    raise exception 'That file link isn’t valid. Try again.';
  end if;
  update public.social_posts set scheduled_at = p_when, media_url = p_media_url, updated_at = now() where id = p_post;
  update public.social_post_targets set next_attempt_at = p_when, updated_at = now() where post_id = p_post and status = 'pending';
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'ai_save_key(text, text, text, text)', 'ai_set_key_options(text, text, boolean)', 'ai_delete_key(text)',
    'ai_record_run(uuid, text, text, text, boolean, integer, integer, numeric)',
    'content_link_post(uuid, uuid)', 'social_reschedule(uuid, timestamptz, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.ai_key_secret(text, uuid) from public';
  execute 'grant execute on function public.ai_key_secret(text, uuid) to anon, authenticated';
end $$;
