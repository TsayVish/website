-- ═════════════════════════════════════════════════════════════════════════
-- Organizations. Staff (admins) only see and act on members who share an org
-- with them; nobody gets platform-wide access to people or private content.
-- The public marketplace (Discover, Search, public listings and creator pages)
-- is unchanged. Admins create orgs; org owners and admins in the org manage members.
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id     uuid not null references public.orgs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  added_by   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members (user_id);

-- People invited by email who don't have an account yet. They join when they sign up.
create table if not exists public.org_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role       text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
revoke insert, update, delete on public.orgs, public.org_members, public.org_invites from anon, authenticated;

-- ── Helpers ──
create or replace function public.in_org(p_org uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.org_members where org_id = p_org and user_id = uid) $$;

create or replace function public.shares_org(other uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = ''
as $$
  select other is not null and uid is not null and exists (
    select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id
    where a.user_id = uid and b.user_id = other)
$$;

-- Staff may see or act on this person: themselves, or someone in one of their orgs.
create or replace function public.staff_can(other uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.is_staff() and (other = auth.uid() or public.shares_org(other)) $$;

-- Can this person manage the org's members? Its owners, and admins who belong to it.
create or replace function public.can_manage_org(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid()
                 and (role = 'owner' or public.is_staff()))
$$;

create or replace function public.require_staff_for(target uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  if target is null or not (target = auth.uid() or public.shares_org(target)) then
    raise exception 'That member isn’t in any of your orgs.';
  end if;
end;
$$;
revoke all on function public.require_staff_for(uuid) from public, anon, authenticated;

grant execute on function public.in_org(uuid, uuid) to authenticated;
grant execute on function public.shares_org(uuid, uuid) to authenticated;
grant execute on function public.staff_can(uuid) to authenticated;
grant execute on function public.can_manage_org(uuid) to authenticated;

-- ── Who can read orgs ──
drop policy if exists "Orgs: members read" on public.orgs;
create policy "Orgs: members read" on public.orgs for select to authenticated using (public.in_org(id));
drop policy if exists "Org members: co-members read" on public.org_members;
create policy "Org members: co-members read" on public.org_members for select to authenticated using (public.in_org(org_id));
drop policy if exists "Org invites: managers read" on public.org_invites;
create policy "Org invites: managers read" on public.org_invites for select to authenticated using (public.can_manage_org(org_id));
-- People in the same org can see each other's profile, even if not public.
drop policy if exists "Profiles: org mates read" on public.profiles;
create policy "Profiles: org mates read" on public.profiles for select to authenticated using (public.shares_org(id));

-- ── Managing orgs ──
create or replace function public.create_org(p_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.is_staff() then raise exception 'Only admins can create orgs.'; end if;
  insert into public.orgs (name, created_by) values (btrim(p_name), auth.uid()) returning id into new_id;
  insert into public.org_members (org_id, user_id, role, added_by) values (new_id, auth.uid(), 'owner', auth.uid());
  perform public.log_admin_action('create_org', 'org', new_id::text, jsonb_build_object('name', p_name));
  return new_id;
end;
$$;

create or replace function public.rename_org(p_org uuid, p_name text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_manage_org(p_org) then raise exception 'Only the org’s owners can do that.'; end if;
  update public.orgs set name = btrim(p_name) where id = p_org;
end;
$$;

create or replace function public.delete_org(p_org uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only the org’s owners can delete it.';
  end if;
  delete from public.orgs where id = p_org;
end;
$$;

-- Adds someone by email. Returns 'added', or 'invited' if they don't have an account yet.
create or replace function public.org_add_member(p_org uuid, p_email text, p_role text default 'member')
returns text language plpgsql security definer set search_path = ''
as $$
declare uid uuid; e text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.can_manage_org(p_org) then raise exception 'Only the org’s owners can add people.'; end if;
  if p_role not in ('owner', 'member') then raise exception 'Unknown role.'; end if;
  if e !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter an email address.'; end if;
  select id into uid from auth.users where lower(email) = e;
  if uid is null then
    insert into public.org_invites (org_id, email, role, invited_by) values (p_org, e, p_role, auth.uid())
    on conflict (org_id, email) do update set role = excluded.role, invited_by = excluded.invited_by, created_at = now();
    return 'invited';
  end if;
  insert into public.org_members (org_id, user_id, role, added_by) values (p_org, uid, p_role, auth.uid())
  on conflict (org_id, user_id) do update set role = excluded.role;
  if public.is_staff() then perform public.log_admin_action('org_add_member', 'org', p_org::text, jsonb_build_object('user', uid, 'role', p_role)); end if;
  return 'added';
end;
$$;

create or replace function public.org_set_role(p_org uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_manage_org(p_org) then raise exception 'Only the org’s owners can change roles.'; end if;
  if p_role not in ('owner', 'member') then raise exception 'Unknown role.'; end if;
  if p_role = 'member' and (select count(*) from public.org_members where org_id = p_org and role = 'owner' and user_id <> p_user) = 0 then
    raise exception 'An org needs at least one owner.';
  end if;
  update public.org_members set role = p_role where org_id = p_org and user_id = p_user;
end;
$$;

-- Owners can remove anyone; anyone can leave.
create or replace function public.org_remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_user <> auth.uid() and not public.can_manage_org(p_org) then raise exception 'Only the org’s owners can remove people.'; end if;
  if (select count(*) from public.org_members where org_id = p_org and role = 'owner' and user_id <> p_user) = 0
     and exists (select 1 from public.org_members where org_id = p_org and user_id = p_user and role = 'owner') then
    raise exception 'An org needs at least one owner. Make someone else an owner first.';
  end if;
  delete from public.org_members where org_id = p_org and user_id = p_user;
  if public.is_staff() then perform public.log_admin_action('org_remove_member', 'org', p_org::text, jsonb_build_object('user', p_user)); end if;
end;
$$;

create or replace function public.org_cancel_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare o uuid;
begin
  select org_id into o from public.org_invites where id = p_invite;
  if o is null or not public.can_manage_org(o) then raise exception 'Invite not found.'; end if;
  delete from public.org_invites where id = p_invite;
end;
$$;

-- Joins any orgs this person was invited to by email (once their email is confirmed).
create or replace function public.claim_org_invites()
returns integer language plpgsql security definer set search_path = ''
as $$
declare e text; n integer := 0;
begin
  select lower(email) into e from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if e is null then return 0; end if;
  with moved as (
    delete from public.org_invites i where lower(i.email) = e returning i.org_id, i.role, i.invited_by
  )
  insert into public.org_members (org_id, user_id, role, added_by)
  select org_id, auth.uid(), role, invited_by from moved
  on conflict (org_id, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Members of an org, with emails for those who manage it.
create or replace function public.org_member_list(p_org uuid)
returns table (user_id uuid, full_name text, email text, role text, is_staff boolean, joined_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare manage boolean := public.can_manage_org(p_org);
begin
  if not public.in_org(p_org) then raise exception 'Not found.'; end if;
  return query
    select m.user_id, p.full_name, case when manage or m.user_id = auth.uid() then u.email::text else null end, m.role,
           exists (select 1 from public.staff s where s.user_id = m.user_id), m.created_at
    from public.org_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id
    where m.org_id = p_org
    order by m.role, p.full_name nulls last;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_org(text)', 'rename_org(uuid, text)', 'delete_org(uuid)', 'org_add_member(uuid, text, text)',
    'org_set_role(uuid, uuid, text)', 'org_remove_member(uuid, uuid)', 'org_cancel_invite(uuid)',
    'claim_org_invites()', 'org_member_list(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ═════ Staff access now stops at the org boundary ═════
drop policy if exists "Staff: staff read" on public.staff;
create policy "Staff: staff read" on public.staff for select to authenticated using (public.staff_can(user_id));
drop policy if exists "Bans: staff read" on public.bans;
create policy "Bans: staff read" on public.bans for select to authenticated using (public.staff_can(user_id));
drop policy if exists "Audit: staff read" on public.admin_actions;
create policy "Audit: staff read" on public.admin_actions for select to authenticated using (public.staff_can(actor_id));
drop policy if exists "Tickets: staff read" on public.service_tickets;
create policy "Tickets: staff read" on public.service_tickets for select to authenticated
  using (public.staff_can((select p.owner_id from public.projects p where p.id = project_id)));
drop policy if exists "Service updates: project members read" on public.service_updates;
create policy "Service updates: project members read" on public.service_updates for select to authenticated
  using (public.can_view_project(project_id) or public.staff_can((select p.owner_id from public.projects p where p.id = project_id)));

drop policy if exists "Staff read all" on public.projects;
drop policy if exists "Staff read org" on public.projects;
create policy "Staff read org" on public.projects for select to authenticated using (public.staff_can(owner_id));
drop policy if exists "Staff read all" on public.project_services;
drop policy if exists "Staff read org" on public.project_services;
create policy "Staff read org" on public.project_services for select to authenticated
  using (public.staff_can((select p.owner_id from public.projects p where p.id = project_id)));
drop policy if exists "Staff read all" on public.profiles;
drop policy if exists "Staff read org" on public.profiles;
create policy "Staff read org" on public.profiles for select to authenticated using (public.staff_can(id));
drop policy if exists "Staff read all" on public.listings;
drop policy if exists "Staff read org" on public.listings;
create policy "Staff read org" on public.listings for select to authenticated using (public.staff_can(owner_id));
drop policy if exists "Staff read all" on public.reports;
drop policy if exists "Staff read org" on public.reports;
create policy "Staff read org" on public.reports for select to authenticated using (public.staff_can(target_owner) or public.staff_can(reporter_id));
drop policy if exists "Staff read all" on public.offers;
drop policy if exists "Staff read org" on public.offers;
create policy "Staff read org" on public.offers for select to authenticated using (public.staff_can(buyer_id) or public.staff_can(seller_id));
drop policy if exists "Staff read all" on public.posts;
drop policy if exists "Staff read org" on public.posts;
create policy "Staff read org" on public.posts for select to authenticated using (public.staff_can(owner_id));

drop policy if exists "Agreements: parties read" on public.agreements;
create policy "Agreements: parties read" on public.agreements for select to authenticated using (
  exists (select 1 from public.offers o where o.id = offer_id
    and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid()) or public.staff_can(o.seller_id) or public.staff_can(o.buyer_id))));

drop policy if exists "Generations: staff read" on public.studio_generations;
create policy "Generations: staff read" on public.studio_generations for select to authenticated using (public.staff_can(created_by));
drop policy if exists "Studio limits: own or staff" on public.studio_limits;
create policy "Studio limits: own or staff" on public.studio_limits for select to authenticated
  using (user_id = (select auth.uid()) or public.staff_can(user_id));
drop policy if exists "Credits: own or staff" on public.credit_ledger;
create policy "Credits: own or staff" on public.credit_ledger for select to authenticated
  using (user_id = (select auth.uid()) or public.staff_can(user_id));
drop policy if exists "Billing exempt: own or staff" on public.billing_exempt;
create policy "Billing exempt: own or staff" on public.billing_exempt for select to authenticated
  using (user_id = (select auth.uid()) or public.staff_can(user_id));

create or replace function public.credit_balance(uid uuid default auth.uid())
returns integer language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(amount_cents), 0)::integer from public.credit_ledger
  where user_id = uid and (uid = auth.uid() or public.staff_can(uid))
$$;

create or replace function public.is_billing_exempt(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.billing_exempt where user_id = uid) and (uid = auth.uid() or public.staff_can(uid)) $$;

create or replace function public.studio_usage(uid uuid default auth.uid())
returns table (used_cents integer, limit_cents integer)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce((select sum(g.cost_cents)::integer from public.studio_generations g
              where g.created_by = uid and g.created_at >= date_trunc('month', now())
                and not (g.status in ('failed', 'canceled') and g.provider_request_id is null)), 0),
    coalesce((select l.monthly_cents from public.studio_limits l where l.user_id = uid), public.studio_default_monthly_cents())
  where uid = auth.uid() or public.staff_can(uid)
$$;

-- Only staff in the same org as the project's owner may change an active service.
create or replace function public.guard_service_status()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not public.staff_can((select p.owner_id from public.projects p where p.id = new.project_id)) then
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

-- ── Admin actions, each limited to members of the admin's orgs ──
create or replace function public.admin_update_service(
  p_project uuid, p_service text, p_status text, p_assignee uuid, p_due date, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare old_status text; owner uuid;
begin
  select owner_id into owner from public.projects where id = p_project;
  perform public.require_staff_for(owner);
  if p_assignee is not null then perform public.require_staff_for(p_assignee); end if;
  if p_status not in ('off', 'requested', 'active') then raise exception 'Unknown status'; end if;
  select status into old_status from public.project_services where project_id = p_project and service = p_service;
  if old_status is null then raise exception 'Service not found'; end if;
  update public.project_services set status = p_status where project_id = p_project and service = p_service;
  insert into public.service_tickets (project_id, service, assignee, due_on, internal_note, updated_at)
  values (p_project, p_service, p_assignee, p_due, nullif(btrim(coalesce(p_note, '')), ''), now())
  on conflict (project_id, service) do update set assignee = excluded.assignee, due_on = excluded.due_on,
    internal_note = excluded.internal_note, updated_at = now();
  if p_status = 'active' and old_status <> 'active' then
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
  select owner_id into owner from public.projects where id = p_project;
  perform public.require_staff_for(owner);
  insert into public.service_updates (project_id, service, author_id, body) values (p_project, p_service, auth.uid(), btrim(p_body));
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
  if p_status not in ('submitted', 'in_review', 'approved', 'declined') then raise exception 'Unknown status'; end if;
  select owner_id, status into owner, old_status from public.projects where id = p_project and type = 'partnership';
  if owner is null then raise exception 'Partnership not found'; end if;
  perform public.require_staff_for(owner);
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
declare r public.reports;
begin
  if p_status not in ('open', 'resolved', 'dismissed') then raise exception 'Unknown status'; end if;
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'Report not found'; end if;
  if not (public.staff_can(r.target_owner) or public.staff_can(r.reporter_id)) then perform public.require_staff_for(null); end if;
  update public.reports set status = p_status where id = p_report;
  perform public.log_admin_action('set_report', 'report', p_report::text, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_hide_content(p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare owner uuid;
begin
  if p_type = 'listing' then select owner_id into owner from public.listings where id = p_id;
  elsif p_type = 'post' then select owner_id into owner from public.posts where id = p_id;
  else raise exception 'Can only hide listings and posts'; end if;
  perform public.require_staff_for(owner);
  if p_type = 'listing' then update public.listings set status = 'hidden' where id = p_id;
  else update public.posts set status = 'draft' where id = p_id; end if;
  perform public.log_admin_action('hide_content', p_type, p_id::text, '{}');
end;
$$;

create or replace function public.admin_ban(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff_for(p_user);
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
  perform public.require_staff_for(p_user);
  delete from public.bans where user_id = p_user;
  perform public.log_admin_action('unban', 'user', p_user::text, '{}');
end;
$$;

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
    where (u.id = auth.uid() or public.shares_org(u.id))
      and (coalesce(q, '') = '' or u.email ilike '%' || q || '%' or p.full_name ilike '%' || q || '%')
    order by u.created_at desc limit 200;
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
    where s.user_id = auth.uid() or public.shares_org(s.user_id)
    order by p.full_name nulls last;
end;
$$;

create or replace function public.admin_set_studio_limit(p_user uuid, p_cents integer)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff_for(p_user);
  if p_cents is null or p_cents < 0 then raise exception 'Enter an amount of $0 or more.'; end if;
  insert into public.studio_limits (user_id, monthly_cents) values (p_user, p_cents)
  on conflict (user_id) do update set monthly_cents = excluded.monthly_cents, updated_at = now();
  perform public.log_admin_action('studio_limit', 'user', p_user::text, jsonb_build_object('monthly_cents', p_cents));
end;
$$;

create or replace function public.admin_clear_studio_limit(p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff_for(p_user);
  delete from public.studio_limits where user_id = p_user;
  perform public.log_admin_action('studio_limit_removed', 'user', p_user::text, '{}'::jsonb);
end;
$$;

create or replace function public.admin_adjust_credits(p_user uuid, p_cents integer, p_note text)
returns integer language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff_for(p_user);
  if p_cents is null or p_cents = 0 then raise exception 'Enter an amount.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a short note saying why.'; end if;
  insert into public.credit_ledger (user_id, kind, amount_cents, note, created_by)
  values (p_user, case when p_cents > 0 then 'grant' else 'adjust' end, p_cents, left(trim(p_note), 300), auth.uid());
  perform public.log_admin_action('credits', 'user', p_user::text, jsonb_build_object('cents', p_cents, 'note', p_note));
  return public.credit_balance(p_user);
end;
$$;

create or replace function public.admin_set_billing_exempt(p_user uuid, p_exempt boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff_for(p_user);
  if p_exempt then
    insert into public.billing_exempt (user_id, note, created_by) values (p_user, nullif(left(trim(coalesce(p_note, '')), 300), ''), auth.uid())
    on conflict (user_id) do update set note = excluded.note, created_by = excluded.created_by, created_at = now();
  else
    delete from public.billing_exempt where user_id = p_user;
  end if;
  perform public.log_admin_action(case when p_exempt then 'billing_off' else 'billing_on' end, 'user', p_user::text, jsonb_build_object('note', p_note));
end;
$$;

-- Billing totals cover the admin and the members of their orgs.
create or replace function public.billing_summary()
returns table (purchased_cents bigint, spent_cents bigint, provider_cents bigint, outstanding_cents bigint, buyers bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  with people as (
    select auth.uid() as uid
    union select b.user_id from public.org_members a join public.org_members b on a.org_id = b.org_id where a.user_id = auth.uid()
  )
  select
    coalesce((select sum(amount_cents) from public.credit_ledger where kind = 'purchase' and created_at >= date_trunc('month', now()) and user_id in (select uid from people)), 0)::bigint,
    coalesce((select -sum(amount_cents) from public.credit_ledger where kind in ('charge', 'refund') and created_at >= date_trunc('month', now()) and user_id in (select uid from people)), 0)::bigint,
    coalesce((select sum(cost_cents) from public.studio_generations
              where created_at >= date_trunc('month', now()) and created_by in (select uid from people)
                and not (status in ('failed', 'canceled') and provider_request_id is null)), 0)::bigint,
    coalesce((select sum(amount_cents) from public.credit_ledger where user_id in (select uid from people)), 0)::bigint,
    (select count(distinct user_id) from public.credit_ledger where kind = 'purchase' and created_at >= date_trunc('month', now()) and user_id in (select uid from people))::bigint;
end;
$$;
