-- ═════════════════════════════════════════════════════════════════════════
-- Admin console: staff, service-request queue, moderation, bans, audit log.
-- Make yourself an admin (once, in the SQL Editor):
--   insert into public.staff (user_id, role)
--   select id, 'admin' from auth.users where email = 'you@example.com'
--   on conflict (user_id) do update set role = 'admin';
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'agent' check (role in ('admin', 'agent')),
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
revoke insert, update, delete on public.staff from anon, authenticated;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.staff where user_id = auth.uid()) $$;
grant execute on function public.is_staff() to anon, authenticated;

drop policy if exists "Staff: staff read" on public.staff;
create policy "Staff: staff read" on public.staff for select to authenticated using (public.is_staff());

-- ── Bans: a banned member can still log in and read, but can't post, list, offer or message ──
create table if not exists public.bans (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  reason     text check (reason is null or char_length(reason) <= 500),
  banned_by  uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.bans enable row level security;
revoke insert, update, delete on public.bans from anon, authenticated;
drop policy if exists "Bans: staff read" on public.bans;
create policy "Bans: staff read" on public.bans for select to authenticated using (public.is_staff());

create or replace function public.is_banned(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.bans where user_id = uid) $$;
grant execute on function public.is_banned(uuid) to authenticated;

-- ── Audit log of every staff action ──
create table if not exists public.admin_actions (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   text not null,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);
alter table public.admin_actions enable row level security;
revoke insert, update, delete on public.admin_actions from anon, authenticated;
drop policy if exists "Audit: staff read" on public.admin_actions;
create policy "Audit: staff read" on public.admin_actions for select to authenticated using (public.is_staff());

create or replace function public.log_admin_action(p_action text, p_type text, p_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = ''
as $$ insert into public.admin_actions (actor_id, action, target_type, target_id, details) values (auth.uid(), p_action, p_type, p_id, p_details) $$;
revoke all on function public.log_admin_action(text, text, text, jsonb) from public, anon, authenticated;

-- ── Service tickets: staff-only working fields for each requested service ──
create table if not exists public.service_tickets (
  project_id    uuid not null references public.projects (id) on delete cascade,
  service       text not null,
  assignee      uuid references auth.users (id) on delete set null,
  due_on        date,
  internal_note text check (internal_note is null or char_length(internal_note) <= 4000),
  updated_at    timestamptz not null default now(),
  primary key (project_id, service)
);
alter table public.service_tickets enable row level security;
revoke insert, update, delete on public.service_tickets from anon, authenticated;
drop policy if exists "Tickets: staff read" on public.service_tickets;
create policy "Tickets: staff read" on public.service_tickets for select to authenticated using (public.is_staff());

-- ── Updates the creator can see on a service tab ──
create table if not exists public.service_updates (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  service    text not null,
  author_id  uuid references auth.users (id) on delete set null,
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists service_updates_project_idx on public.service_updates (project_id, service, created_at desc);
alter table public.service_updates enable row level security;
revoke insert, update, delete on public.service_updates from anon, authenticated;
drop policy if exists "Service updates: project members read" on public.service_updates;
create policy "Service updates: project members read" on public.service_updates for select to authenticated
  using (public.can_view_project(project_id) or public.is_staff());

-- ── Notifications: more kinds, and a link to a project ──
alter table public.notifications add column if not exists project_id uuid references public.projects (id) on delete cascade;
alter table public.notifications add column if not exists body text check (body is null or char_length(body) <= 300);
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'offer_received', 'offer_accepted', 'offer_declined', 'offer_withdrawn', 'offer_paid', 'new_follower',
  'service_update', 'service_active', 'partnership_update', 'agreement_proposed', 'agreement_signed', 'credits_added'));

-- ── Staff can read everything they need to run the platform ──
drop policy if exists "Staff read all" on public.projects;
create policy "Staff read all" on public.projects for select to authenticated using (public.is_staff());
drop policy if exists "Staff read all" on public.project_services;
create policy "Staff read all" on public.project_services for select to authenticated using (public.is_staff());
drop policy if exists "Staff read all" on public.profiles;
create policy "Staff read all" on public.profiles for select to authenticated using (public.is_staff());
drop policy if exists "Staff read all" on public.listings;
create policy "Staff read all" on public.listings for select to authenticated using (public.is_staff());
drop policy if exists "Staff read all" on public.reports;
create policy "Staff read all" on public.reports for select to authenticated using (public.is_staff());
drop policy if exists "Staff read all" on public.offers;
create policy "Staff read all" on public.offers for select to authenticated using (public.is_staff());
drop policy if exists "Staff read all" on public.posts;
create policy "Staff read all" on public.posts for select to authenticated using (public.is_staff());

-- Staff may set a service active (members still can't).
create or replace function public.guard_service_status()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and not public.is_staff() then
    if tg_op = 'INSERT' and new.status = 'active' then
      raise exception 'Only the tsayvish team can mark a service active';
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status
       and (new.status = 'active' or old.status = 'active') then
      raise exception 'Only the tsayvish team can change an active service';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- ── Staff actions (each one checks staff and writes to the audit log) ──
create or replace function public.require_staff()
returns void language plpgsql stable security definer set search_path = ''
as $$ begin if not public.is_staff() then raise exception 'Staff only'; end if; end; $$;
revoke all on function public.require_staff() from public, anon, authenticated;

create or replace function public.admin_update_service(
  p_project uuid, p_service text, p_status text, p_assignee uuid, p_due date, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare old_status text; owner uuid;
begin
  perform public.require_staff();
  if p_status not in ('off', 'requested', 'active') then raise exception 'Unknown status'; end if;
  select status into old_status from public.project_services where project_id = p_project and service = p_service;
  if old_status is null then raise exception 'Service not found'; end if;
  update public.project_services set status = p_status where project_id = p_project and service = p_service;
  insert into public.service_tickets (project_id, service, assignee, due_on, internal_note, updated_at)
  values (p_project, p_service, p_assignee, p_due, nullif(btrim(coalesce(p_note, '')), ''), now())
  on conflict (project_id, service) do update set assignee = excluded.assignee, due_on = excluded.due_on,
    internal_note = excluded.internal_note, updated_at = now();
  if p_status = 'active' and old_status <> 'active' then
    select owner_id into owner from public.projects where id = p_project;
    insert into public.notifications (user_id, type, actor_id, project_id, body)
    values (owner, 'service_active', auth.uid(), p_project, p_service || ' is now active');
  end if;
  perform public.log_admin_action('update_service', 'project_service', p_project::text || ':' || p_service,
    jsonb_build_object('from', old_status, 'to', p_status, 'assignee', p_assignee, 'due_on', p_due));
end;
$$;

create or replace function public.admin_post_service_update(p_project uuid, p_service text, p_body text)
returns void language plpgsql security definer set search_path = ''
as $$
declare owner uuid;
begin
  perform public.require_staff();
  insert into public.service_updates (project_id, service, author_id, body) values (p_project, p_service, auth.uid(), btrim(p_body));
  select owner_id into owner from public.projects where id = p_project;
  insert into public.notifications (user_id, type, actor_id, project_id, body)
  values (owner, 'service_update', auth.uid(), p_project, left(p_service || ': ' || btrim(p_body), 300));
  perform public.log_admin_action('post_service_update', 'project_service', p_project::text || ':' || p_service, '{}');
end;
$$;

create or replace function public.admin_set_partnership_status(p_project uuid, p_status text, p_message text)
returns void language plpgsql security definer set search_path = ''
as $$
declare owner uuid; old_status text;
begin
  perform public.require_staff();
  if p_status not in ('submitted', 'in_review', 'approved', 'declined') then raise exception 'Unknown status'; end if;
  select owner_id, status into owner, old_status from public.projects where id = p_project and type = 'partnership';
  if owner is null then raise exception 'Partnership not found'; end if;
  update public.projects set status = p_status where id = p_project;
  insert into public.notifications (user_id, type, actor_id, project_id, body)
  values (owner, 'partnership_update', auth.uid(), p_project,
          left(coalesce(nullif(btrim(coalesce(p_message, '')), ''), 'Status changed to ' || replace(p_status, '_', ' ')), 300));
  perform public.log_admin_action('set_partnership_status', 'project', p_project::text, jsonb_build_object('from', old_status, 'to', p_status));
end;
$$;

create or replace function public.admin_set_report(p_report uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  if p_status not in ('open', 'resolved', 'dismissed') then raise exception 'Unknown status'; end if;
  update public.reports set status = p_status where id = p_report;
  if not found then raise exception 'Report not found'; end if;
  perform public.log_admin_action('set_report', 'report', p_report::text, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_hide_content(p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  if p_type = 'listing' then update public.listings set status = 'hidden' where id = p_id;
  elsif p_type = 'post' then update public.posts set status = 'draft' where id = p_id;
  else raise exception 'Can only hide listings and posts'; end if;
  perform public.log_admin_action('hide_content', p_type, p_id::text, '{}');
end;
$$;

create or replace function public.admin_ban(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  if exists (select 1 from public.staff where user_id = p_user) then raise exception 'Staff can’t be banned here'; end if;
  insert into public.bans (user_id, reason, banned_by) values (p_user, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid())
  on conflict (user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();
  update public.listings set status = 'hidden' where owner_id = p_user;
  update public.profiles set discoverable = false where id = p_user;
  perform public.log_admin_action('ban', 'user', p_user::text, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_unban(p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  delete from public.bans where user_id = p_user;
  perform public.log_admin_action('unban', 'user', p_user::text, '{}');
end;
$$;

-- Find members by name or email (staff only).
create or replace function public.admin_find_users(q text)
returns table (id uuid, email text, full_name text, created_at timestamptz, banned boolean, staff_role text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
    select u.id, u.email::text, p.full_name, u.created_at,
           exists (select 1 from public.bans b where b.user_id = u.id),
           (select s.role from public.staff s where s.user_id = u.id)
    from auth.users u left join public.profiles p on p.id = u.id
    where coalesce(q, '') = '' or u.email ilike '%' || q || '%' or p.full_name ilike '%' || q || '%'
    order by u.created_at desc limit 100;
end;
$$;

create or replace function public.admin_staff_list()
returns table (user_id uuid, full_name text, email text, role text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  return query select s.user_id, p.full_name, u.email::text, s.role
    from public.staff s join auth.users u on u.id = s.user_id left join public.profiles p on p.id = s.user_id
    order by p.full_name nulls last;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_update_service(uuid, text, text, uuid, date, text)', 'admin_post_service_update(uuid, text, text)',
    'admin_set_partnership_status(uuid, text, text)', 'admin_set_report(uuid, text)', 'admin_hide_content(text, uuid)',
    'admin_ban(uuid, text)', 'admin_unban(uuid)', 'admin_find_users(text)', 'admin_staff_list()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
