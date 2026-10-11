-- ═════════════════════════════════════════════════════════════════════════
-- Trust and safety: rate limits, verified email to take part, and bans enforced.
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.is_verified(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from auth.users where id = uid and email_confirmed_at is not null) $$;
grant execute on function public.is_verified(uuid) to authenticated;

-- Blocks banned members (and, where asked, unverified ones) from creating things.
-- Usage: before insert ... execute procedure public.member_can_create('verified') — or no argument.
create or replace function public.member_can_create()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;            -- server/admin writes
  if public.is_banned(auth.uid()) then
    raise exception 'Your account is restricted. Contact support@tsayvish.com if you think this is a mistake.';
  end if;
  if tg_nargs > 0 and tg_argv[0] = 'verified' and not public.is_verified(auth.uid()) then
    raise exception 'Confirm your email address first. Check your inbox for the link.';
  end if;
  return new;
end;
$$;

-- Rate limit: at most tg_argv[2] rows per tg_argv[1] (an interval) for the user in column tg_argv[0].
create or replace function public.rate_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare n integer; col text := tg_argv[0]; win interval := tg_argv[1]::interval; cap integer := tg_argv[2]::integer;
begin
  if auth.uid() is null then return new; end if;
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - $2', tg_table_schema, tg_table_name, col)
    into n using auth.uid(), win;
  if n >= cap then
    raise exception 'You’re doing that too often. Please wait a little and try again.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;

do $$
declare t record;
begin
  -- table, user column, window, max, needs verified email
  for t in select * from (values
    ('messages',          'sender_id',   '1 minute', 30,   true),
    ('offers',            'buyer_id',    '1 hour',   20,   true),
    ('listings',          'owner_id',    '1 day',    30,   true),
    ('posts',             'owner_id',    '1 day',    30,   true),
    ('reports',           'reporter_id', '1 day',    20,   false),
    ('follows',           'follower_id', '1 hour',   100,  false),
    ('projects',          'owner_id',    '1 day',    300,  false),
    ('workspace_invites', 'created_by',  '1 day',    50,   true),
    ('character_assets',  'added_by',    '1 hour',   200,  false)
  ) as v(tbl, col, win, cap, verified) loop
    execute format('drop trigger if exists rate_limit on public.%I', t.tbl);
    execute format('create trigger rate_limit before insert on public.%I for each row execute procedure public.rate_limit(%L, %L, %L)',
                   t.tbl, t.col, t.win, t.cap);
    execute format('drop trigger if exists member_can_create on public.%I', t.tbl);
    if t.verified then
      execute format('create trigger member_can_create before insert on public.%I for each row execute procedure public.member_can_create(%L)', t.tbl, 'verified');
    else
      execute format('create trigger member_can_create before insert on public.%I for each row execute procedure public.member_can_create()', t.tbl);
    end if;
  end loop;
end $$;

-- A second, daily cap on messages.
drop trigger if exists rate_limit_daily on public.messages;
create trigger rate_limit_daily before insert on public.messages
  for each row execute procedure public.rate_limit('sender_id', '1 day', '1000');

-- Banned members can't start new chats either.
create or replace function public.guard_new_conversation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and public.is_banned(auth.uid()) then raise exception 'Your account is restricted.'; end if;
  return new;
end;
$$;
drop trigger if exists guard_new_conversation on public.conversations;
create trigger guard_new_conversation before insert on public.conversations
  for each row execute procedure public.guard_new_conversation();
