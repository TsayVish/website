-- ═════════════════════════════════════════════════════════════════════════
-- Social publishing: each character can connect an Instagram, Facebook Page,
-- YouTube channel and TikTok account, then post library media now or later.
--
-- Access tokens are encrypted by the server (SOCIAL_TOKEN_KEY, never in the
-- database) and the encrypted columns can't be read by any signed-in client.
-- Only the server's publisher reads them, through functions that need the
-- server secret (the same one as BILLING_DB_SECRET; see new_billing_secret).
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

-- True when p_secret is the server secret.
create or replace function public.server_secret_ok(p_secret text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select hash = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex')
                   from public.billing_secret where id), false)
$$;
revoke all on function public.server_secret_ok(text) from public, anon, authenticated;

-- ── Connected accounts ──
create table if not exists public.social_accounts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  platform     text not null check (platform in ('instagram', 'facebook', 'youtube', 'tiktok')),
  external_id  text not null check (char_length(external_id) <= 200),
  name         text check (name is null or char_length(name) <= 200),
  handle       text check (handle is null or char_length(handle) <= 200),
  avatar_url   text check (avatar_url is null or char_length(avatar_url) <= 2000),
  connected_by uuid references auth.users (id) on delete set null,
  status       text not null default 'active' check (status in ('active', 'reconnect')),
  last_error   text check (last_error is null or char_length(last_error) <= 500),
  has_choices  boolean not null default false,
  -- Encrypted by the server. Never selectable by clients (see grants below).
  token_enc    text,
  refresh_enc  text,
  choices_enc  text,
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, platform)
);
alter table public.social_accounts enable row level security;
revoke all on public.social_accounts from anon, authenticated;
grant select (id, project_id, platform, external_id, name, handle, avatar_url, connected_by, status, last_error, has_choices, expires_at, created_at, updated_at)
  on public.social_accounts to authenticated;
drop policy if exists "Social accounts: view" on public.social_accounts;
create policy "Social accounts: view" on public.social_accounts for select to authenticated using (public.can_view_project(project_id));

-- ── Posts and their per-platform deliveries ──
create table if not exists public.social_posts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  created_by   uuid references auth.users (id) on delete set null,
  media_id     uuid references public.studio_media (id) on delete set null,
  media_kind   text not null check (media_kind in ('image', 'video')),
  media_label  text check (media_label is null or char_length(media_label) <= 120),
  media_mime   text check (media_mime is null or char_length(media_mime) <= 80),
  media_bytes  bigint,
  -- A signed link to the file that lasts until after the post goes out.
  media_url    text not null check (char_length(media_url) <= 4000),
  caption      text not null default '' check (char_length(caption) <= 5000),
  title        text check (title is null or char_length(title) <= 100),
  options      jsonb not null default '{}' check (pg_column_size(options) <= 4000),
  scheduled_at timestamptz not null default now(),
  status       text not null default 'scheduled' check (status in ('scheduled', 'publishing', 'posted', 'partial', 'failed', 'canceled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists social_posts_project_idx on public.social_posts (project_id, scheduled_at desc);
alter table public.social_posts enable row level security;
revoke all on public.social_posts from anon, authenticated;
grant select on public.social_posts to authenticated;
drop policy if exists "Social posts: view" on public.social_posts;
create policy "Social posts: view" on public.social_posts for select to authenticated using (public.can_view_project(project_id));

create table if not exists public.social_post_targets (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.social_posts (id) on delete cascade,
  account_id      uuid references public.social_accounts (id) on delete set null,
  platform        text not null check (platform in ('instagram', 'facebook', 'youtube', 'tiktok')),
  account_name    text,
  status          text not null default 'pending' check (status in ('pending', 'publishing', 'processing', 'posted', 'failed', 'canceled')),
  external_id     text,
  external_url    text,
  error           text check (error is null or char_length(error) <= 500),
  state           jsonb not null default '{}',
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  posted_at       timestamptz,
  updated_at      timestamptz not null default now(),
  unique (post_id, platform)
);
create index if not exists social_targets_due_idx on public.social_post_targets (next_attempt_at) where status in ('pending', 'processing');
alter table public.social_post_targets enable row level security;
revoke all on public.social_post_targets from anon, authenticated;
grant select (id, post_id, account_id, platform, account_name, status, external_id, external_url, error, attempts, posted_at, updated_at)
  on public.social_post_targets to authenticated;
drop policy if exists "Social targets: view" on public.social_post_targets;
create policy "Social targets: view" on public.social_post_targets for select to authenticated
  using (exists (select 1 from public.social_posts p where p.id = post_id and public.can_view_project(p.project_id)));

-- What each platform accepts.
create or replace function public.social_platform_takes(p_platform text, p_kind text)
returns boolean language sql immutable
as $$ select case p_platform when 'youtube' then p_kind = 'video' when 'tiktok' then p_kind = 'video' else p_kind in ('image', 'video') end $$;

-- Rolls the targets up into the post's status.
create or replace function public.social_refresh_post(p_post uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare s text;
begin
  select case
    when bool_and(status = 'canceled') then 'canceled'
    when bool_or(status in ('pending')) and not bool_or(status in ('publishing', 'processing', 'posted', 'failed')) then 'scheduled'
    when bool_or(status in ('pending', 'publishing', 'processing')) then 'publishing'
    when bool_and(status in ('posted', 'canceled')) then 'posted'
    when bool_or(status = 'posted') then 'partial'
    else 'failed' end
  into s from public.social_post_targets where post_id = p_post;
  update public.social_posts set status = coalesce(s, 'canceled'), updated_at = now() where id = p_post;
end;
$$;
revoke all on function public.social_refresh_post(uuid) from public, anon, authenticated;

-- ═════ Called by signed-in people ═════

-- Saves (or replaces) a connection after the platform's sign-in. Tokens arrive already encrypted.
create or replace function public.social_save_account(
  p_project uuid, p_platform text, p_external_id text, p_name text, p_handle text, p_avatar text,
  p_token_enc text, p_refresh_enc text, p_expires_at timestamptz, p_choices_enc text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare aid uuid;
begin
  if not public.can_edit_project(p_project) then raise exception 'Only the character’s owner or editors can connect accounts.'; end if;
  if public.is_banned(auth.uid()) then raise exception 'Your account is restricted.'; end if;
  if not exists (select 1 from public.projects where id = p_project and type = 'original') then raise exception 'Character not found.'; end if;
  insert into public.social_accounts (project_id, platform, external_id, name, handle, avatar_url, connected_by, status, last_error,
                                      token_enc, refresh_enc, choices_enc, has_choices, expires_at, updated_at)
  values (p_project, p_platform, left(p_external_id, 200), left(p_name, 200), left(p_handle, 200), left(p_avatar, 2000), auth.uid(), 'active', null,
          p_token_enc, p_refresh_enc, p_choices_enc, p_choices_enc is not null, p_expires_at, now())
  on conflict (project_id, platform) do update set
    external_id = excluded.external_id, name = excluded.name, handle = excluded.handle, avatar_url = excluded.avatar_url,
    connected_by = excluded.connected_by, status = 'active', last_error = null, token_enc = excluded.token_enc,
    refresh_enc = excluded.refresh_enc, choices_enc = excluded.choices_enc, has_choices = excluded.has_choices,
    expires_at = excluded.expires_at, updated_at = now()
  returning id into aid;
  return aid;
end;
$$;

-- Disconnects an account. Anything still waiting to go to it is canceled.
create or replace function public.social_disconnect(p_account uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare pid uuid; r record;
begin
  select project_id into pid from public.social_accounts where id = p_account;
  if pid is null or not public.can_edit_project(pid) then raise exception 'Account not found.'; end if;
  for r in update public.social_post_targets set status = 'canceled', error = 'Account disconnected', updated_at = now()
           where account_id = p_account and status = 'pending' returning post_id loop
    perform public.social_refresh_post(r.post_id);
  end loop;
  delete from public.social_accounts where id = p_account;
end;
$$;

-- Creates a post with one delivery per chosen account. Returns its id.
create or replace function public.social_create_post(
  p_project uuid, p_media uuid, p_media_url text, p_caption text, p_title text, p_options jsonb,
  p_scheduled_at timestamptz, p_accounts uuid[])
returns uuid language plpgsql security definer set search_path = ''
as $$
declare m record; pid uuid; a record; n integer := 0; when_at timestamptz := greatest(coalesce(p_scheduled_at, now()), now());
begin
  if not public.can_edit_project(p_project) then raise exception 'Only the character’s owner or editors can post.'; end if;
  if public.is_banned(auth.uid()) then raise exception 'Your account is restricted.'; end if;
  select id, kind, label, mime, bytes, path into m from public.studio_media where id = p_media and project_id = p_project;
  if m.id is null then raise exception 'Pick a picture or video from this character’s library.'; end if;
  if m.kind not in ('image', 'video') then raise exception 'Only pictures and videos can be posted.'; end if;
  -- The link must be a signed link to this exact file (made by the server).
  if position('/storage/v1/object/sign/studio-media/' || m.path || '?' in coalesce(p_media_url, '')) = 0 then
    raise exception 'That file link isn’t valid. Try again.';
  end if;
  if when_at > now() + interval '60 days' then raise exception 'You can schedule up to 60 days ahead.'; end if;
  if coalesce(array_length(p_accounts, 1), 0) = 0 then raise exception 'Choose at least one account.'; end if;
  if (select count(*) from public.social_posts where project_id = p_project and created_at > now() - interval '1 day') >= 50 then
    raise exception 'That’s 50 posts today for this character. Try again tomorrow.';
  end if;
  insert into public.social_posts (project_id, created_by, media_id, media_kind, media_label, media_mime, media_bytes, media_url, caption, title, options, scheduled_at)
  values (p_project, auth.uid(), m.id, m.kind, m.label, m.mime, m.bytes, p_media_url, coalesce(p_caption, ''), nullif(btrim(coalesce(p_title, '')), ''),
          coalesce(p_options, '{}'), when_at)
  returning id into pid;
  for a in select id, platform, coalesce(handle, name) as label from public.social_accounts
           where project_id = p_project and id = any(p_accounts) loop
    if not public.social_platform_takes(a.platform, m.kind) then
      raise exception '% only takes videos.', initcap(a.platform);
    end if;
    insert into public.social_post_targets (post_id, account_id, platform, account_name, next_attempt_at)
    values (pid, a.id, a.platform, a.label, when_at);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Choose at least one connected account.'; end if;
  return pid;
end;
$$;

-- Cancels whatever hasn't gone out yet.
create or replace function public.social_cancel_post(p_post uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare pid uuid;
begin
  select project_id into pid from public.social_posts where id = p_post;
  if pid is null or not public.can_edit_project(pid) then raise exception 'Post not found.'; end if;
  update public.social_post_targets set status = 'canceled', updated_at = now() where post_id = p_post and status = 'pending';
  perform public.social_refresh_post(p_post);
end;
$$;

-- Removes a post from the list (only once nothing is mid-flight). Published posts stay on the platforms.
create or replace function public.social_delete_post(p_post uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare pid uuid;
begin
  select project_id into pid from public.social_posts where id = p_post;
  if pid is null or not public.can_edit_project(pid) then raise exception 'Post not found.'; end if;
  if exists (select 1 from public.social_post_targets where post_id = p_post and status in ('publishing', 'processing')) then
    raise exception 'This post is going out right now. Try again in a minute.';
  end if;
  delete from public.social_posts where id = p_post;
end;
$$;

-- ═════ Called only by the server's publisher (needs the server secret) ═════

-- Account details including encrypted tokens, for the publisher and the page picker.
create or replace function public.social_account_secret(p_secret text, p_account uuid)
returns table (id uuid, project_id uuid, platform text, external_id text, token_enc text, refresh_enc text, choices_enc text, expires_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.server_secret_ok(p_secret) then raise exception 'Not allowed.'; end if;
  return query select a.id, a.project_id, a.platform, a.external_id, a.token_enc, a.refresh_enc, a.choices_enc, a.expires_at
    from public.social_accounts a where a.id = p_account;
end;
$$;

-- Stores refreshed tokens, a different Page, or marks the account as needing a reconnect.
create or replace function public.social_update_account(
  p_secret text, p_account uuid, p_token_enc text default null, p_refresh_enc text default null, p_expires_at timestamptz default null,
  p_external_id text default null, p_name text default null, p_handle text default null, p_avatar text default null, p_reconnect_error text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.server_secret_ok(p_secret) then raise exception 'Not allowed.'; end if;
  update public.social_accounts set
    token_enc   = coalesce(p_token_enc, token_enc),
    refresh_enc = coalesce(p_refresh_enc, refresh_enc),
    expires_at  = case when p_token_enc is not null then p_expires_at else expires_at end,
    external_id = coalesce(p_external_id, external_id),
    name        = coalesce(p_name, name),
    handle      = coalesce(p_handle, handle),
    avatar_url  = coalesce(p_avatar, avatar_url),
    status      = case when p_reconnect_error is not null then 'reconnect' when p_token_enc is not null then 'active' else status end,
    last_error  = case when p_reconnect_error is not null then left(p_reconnect_error, 500) when p_token_enc is not null then null else last_error end,
    updated_at  = now()
  where id = p_account;
end;
$$;

drop function if exists public.social_claim(text, integer, uuid);
-- Hands out deliveries that are due, locking each for five minutes so two runs can't send it twice.
create or replace function public.social_claim(p_secret text, p_limit integer default 5, p_post uuid default null)
returns table (
  target_id uuid, post_id uuid, platform text, status text, state jsonb, attempts integer,
  account_id uuid, external_id text, handle text, token_enc text, refresh_enc text, expires_at timestamptz,
  media_kind text, media_url text, media_mime text, media_bytes bigint, caption text, title text, options jsonb)
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.server_secret_ok(p_secret) then raise exception 'Not allowed.'; end if;
  return query
  with due as (
    select t.id from public.social_post_targets t join public.social_posts p on p.id = t.post_id
    where t.status in ('pending', 'processing') and t.next_attempt_at <= now() and p.scheduled_at <= now()
      and (t.locked_until is null or t.locked_until < now()) and (p_post is null or t.post_id = p_post)
    order by t.next_attempt_at
    limit greatest(1, least(coalesce(p_limit, 5), 25))
    for update of t skip locked
  ), claimed as (
    update public.social_post_targets t set
      locked_until = now() + interval '5 minutes',
      status = case when t.status = 'pending' then 'publishing' else t.status end,
      attempts = t.attempts + 1, updated_at = now()
    from due where t.id = due.id
    returning t.*
  )
  select c.id, c.post_id, c.platform, c.status, c.state, c.attempts,
         a.id, a.external_id, a.handle, a.token_enc, a.refresh_enc, a.expires_at,
         p.media_kind, p.media_url, p.media_mime, p.media_bytes, p.caption, p.title, p.options
  from claimed c join public.social_posts p on p.id = c.post_id left join public.social_accounts a on a.id = c.account_id;
end;
$$;

-- Records what happened to one delivery.
-- p_status: 'posted', 'processing' (check again in p_retry_seconds), 'retry' (try again later), or 'failed'.
create or replace function public.social_report(
  p_secret text, p_target uuid, p_status text, p_state jsonb default null, p_external_id text default null,
  p_url text default null, p_error text default null, p_retry_seconds integer default 60)
returns void language plpgsql security definer set search_path = ''
as $$
declare pid uuid;
begin
  if not public.server_secret_ok(p_secret) then raise exception 'Not allowed.'; end if;
  if p_status not in ('posted', 'processing', 'retry', 'failed') then raise exception 'Unknown status.'; end if;
  update public.social_post_targets set
    status = case p_status when 'retry' then 'pending' else p_status end,
    state = coalesce(p_state, state),
    external_id = coalesce(p_external_id, external_id),
    external_url = coalesce(p_url, external_url),
    error = case when p_status in ('posted', 'processing') then null else left(p_error, 500) end,
    next_attempt_at = now() + make_interval(secs => greatest(5, least(coalesce(p_retry_seconds, 60), 86400))),
    locked_until = null,
    posted_at = case when p_status = 'posted' then now() else posted_at end,
    updated_at = now()
  where id = p_target and status not in ('posted', 'canceled')
  returning post_id into pid;
  if pid is not null then perform public.social_refresh_post(pid); end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'social_save_account(uuid, text, text, text, text, text, text, text, timestamptz, text)',
    'social_disconnect(uuid)', 'social_cancel_post(uuid)', 'social_delete_post(uuid)',
    'social_create_post(uuid, uuid, text, text, text, jsonb, timestamptz, uuid[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- The publisher calls these with the publishable key and proves itself with the server secret.
  foreach f in array array[
    'social_account_secret(text, uuid)',
    'social_update_account(text, uuid, text, text, timestamptz, text, text, text, text, text)',
    'social_claim(text, integer, uuid)',
    'social_report(text, uuid, text, jsonb, text, text, text, integer)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
