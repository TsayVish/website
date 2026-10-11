-- ═════════════════════════════════════════════════════════════════════════
-- Credits: people pay for AI Studio generation upfront.
-- Balances are in US cents. Each job is charged when it starts (provider cost × markup)
-- and refunded automatically if it fails. Purchases come from Stripe Checkout and are
-- recorded by the server with a shared secret (see new_billing_secret below).
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

-- ── Settings: change the numbers here ──
-- What people pay per cent of provider cost.
create or replace function public.credit_markup()
returns numeric language sql immutable as $$ select 1.5::numeric $$;
-- Free credits every account gets once, in cents.
create or replace function public.starter_credits_cents()
returns integer language sql immutable as $$ select 100 $$;
grant execute on function public.credit_markup() to anon, authenticated;
grant execute on function public.starter_credits_cents() to anon, authenticated;

-- ── The ledger: every purchase, charge and refund ──
create table if not exists public.credit_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('starter', 'purchase', 'grant', 'charge', 'refund', 'adjust')),
  amount_cents   integer not null check (amount_cents <> 0 and abs(amount_cents) <= 10000000),
  generation_id  uuid references public.studio_generations (id) on delete set null,
  stripe_session text unique,
  note           text check (note is null or char_length(note) <= 300),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
create unique index if not exists credit_ledger_one_starter on public.credit_ledger (user_id) where kind = 'starter';
create unique index if not exists credit_ledger_one_per_job on public.credit_ledger (generation_id, kind) where generation_id is not null;
alter table public.credit_ledger enable row level security;
drop policy if exists "Credits: own or staff" on public.credit_ledger;
create policy "Credits: own or staff" on public.credit_ledger for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());
revoke insert, update, delete on public.credit_ledger from anon, authenticated;

alter table public.studio_generations add column if not exists price_cents integer not null default 0 check (price_cents >= 0);

create or replace function public.credit_balance(uid uuid default auth.uid())
returns integer language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(amount_cents), 0)::integer from public.credit_ledger
  where user_id = uid and (uid = auth.uid() or public.is_staff())
$$;
grant execute on function public.credit_balance(uuid) to authenticated;

-- What a job will cost the person, in cents.
create or replace function public.credit_price(p_cost_cents integer)
returns integer language sql immutable
as $$ select greatest(1, ceil(greatest(p_cost_cents, 0) * public.credit_markup()))::integer $$;
grant execute on function public.credit_price(integer) to anon, authenticated;

-- Gives the one-time starter credits. Safe to call any number of times. Returns the balance.
create or replace function public.claim_starter_credits()
returns integer language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return 0; end if;
  if public.starter_credits_cents() > 0 and not public.is_banned(auth.uid()) then
    insert into public.credit_ledger (user_id, kind, amount_cents, note, created_by)
    values (auth.uid(), 'starter', public.starter_credits_cents(), 'Welcome credits', auth.uid())
    on conflict do nothing;
  end if;
  return public.credit_balance(auth.uid());
end;
$$;
grant execute on function public.claim_starter_credits() to authenticated;

-- ── Purchases: recorded by the server after Stripe confirms payment ──
-- The server proves itself with a secret whose hash lives here. Make one with:
--   select public.new_billing_secret();
-- and put the result in Vercel as BILLING_DB_SECRET. Running it again replaces the old one.
create table if not exists public.billing_secret (
  id         boolean primary key default true check (id),
  hash       text not null,
  created_at timestamptz not null default now()
);
alter table public.billing_secret enable row level security;
revoke all on public.billing_secret from anon, authenticated;

create or replace function public.new_billing_secret()
returns text language plpgsql security definer set search_path = ''
as $$
declare s text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  insert into public.billing_secret (id, hash) values (true, encode(sha256(convert_to(s, 'UTF8')), 'hex'))
  on conflict (id) do update set hash = excluded.hash, created_at = now();
  return s;
end;
$$;
revoke all on function public.new_billing_secret() from public, anon, authenticated;

-- Adds purchased credits once per Stripe Checkout session. Returns true if this call added them.
create or replace function public.record_credit_purchase(p_secret text, p_session text, p_user uuid, p_cents integer, p_note text default null)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare ok boolean; n integer;
begin
  select hash = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex') into ok from public.billing_secret where id;
  if not coalesce(ok, false) then raise exception 'Not allowed.'; end if;
  if p_session is null or p_user is null or p_cents is null or p_cents <= 0 then raise exception 'Invalid purchase.'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'Unknown member.'; end if;
  insert into public.credit_ledger (user_id, kind, amount_cents, stripe_session, note, created_by)
  values (p_user, 'purchase', p_cents, left(p_session, 255), left(coalesce(p_note, 'Credits'), 300), null)
  on conflict (stripe_session) do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.notifications (user_id, type, actor_id, body)
    values (p_user, 'credits_added', null, format('$%s of AI Studio credits added.', to_char(p_cents / 100.0, 'FM999990.00')));
  end if;
  return n > 0;
end;
$$;
revoke all on function public.record_credit_purchase(text, text, uuid, integer, text) from public;
grant execute on function public.record_credit_purchase(text, text, uuid, integer, text) to anon, authenticated;

-- A notification type for purchases.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'offer_received', 'offer_accepted', 'offer_declined', 'offer_withdrawn', 'offer_paid', 'new_follower',
  'service_update', 'service_active', 'partnership_update', 'agreement_proposed', 'agreement_signed', 'credits_added'));

-- ── Staff: add or remove credits, with a note ──
create or replace function public.admin_adjust_credits(p_user uuid, p_cents integer, p_note text)
returns integer language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  if p_cents is null or p_cents = 0 then raise exception 'Enter an amount.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a short note saying why.'; end if;
  insert into public.credit_ledger (user_id, kind, amount_cents, note, created_by)
  values (p_user, case when p_cents > 0 then 'grant' else 'adjust' end, p_cents, left(trim(p_note), 300), auth.uid());
  perform public.log_admin_action('credits', 'user', p_user::text, jsonb_build_object('cents', p_cents, 'note', p_note));
  return public.credit_balance(p_user);
end;
$$;
grant execute on function public.admin_adjust_credits(uuid, integer, text) to authenticated;

-- Money in and out this month, for the admin billing page.
create or replace function public.billing_summary()
returns table (purchased_cents bigint, spent_cents bigint, provider_cents bigint, outstanding_cents bigint, buyers bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  return query select
    coalesce((select sum(amount_cents) from public.credit_ledger where kind = 'purchase' and created_at >= date_trunc('month', now())), 0)::bigint,
    coalesce((select -sum(amount_cents) from public.credit_ledger where kind in ('charge', 'refund') and created_at >= date_trunc('month', now())), 0)::bigint,
    coalesce((select sum(cost_cents) from public.studio_generations
              where created_at >= date_trunc('month', now()) and not (status in ('failed', 'canceled') and provider_request_id is null)), 0)::bigint,
    coalesce((select sum(amount_cents) from public.credit_ledger), 0)::bigint,
    (select count(distinct user_id) from public.credit_ledger where kind = 'purchase' and created_at >= date_trunc('month', now()))::bigint;
end;
$$;
grant execute on function public.billing_summary() to authenticated;

-- ── Generation now charges credits ──
-- A staff-set monthly cap (studio_limits) still applies if one exists for the person.
create or replace function public.studio_start_generation(
  p_project uuid, p_tool text, p_model text, p_prompt text, p_params jsonb, p_inputs jsonb, p_cost_cents integer)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare used integer; cap integer; new_id uuid; price integer; bal integer;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if not public.can_edit_project(p_project) then raise exception 'You can only generate for characters you can edit.'; end if;
  if coalesce(p_cost_cents, 0) < 0 then raise exception 'Invalid cost.'; end if;

  -- One job at a time per person while the balance is checked.
  perform pg_advisory_xact_lock(hashtext('credits:' || auth.uid()::text));

  select l.monthly_cents into cap from public.studio_limits l where l.user_id = auth.uid();
  if cap is not null then
    select u.used_cents into used from public.studio_usage(auth.uid()) u;
    if used + coalesce(p_cost_cents, 0) > cap then
      raise exception 'You’ve reached the monthly AI Studio limit on your account. Contact the tsayvish team.' using hint = 'over_limit';
    end if;
  end if;

  price := public.credit_price(coalesce(p_cost_cents, 0));
  bal := public.credit_balance(auth.uid());
  if bal < price then
    raise exception 'Not enough credits: this costs $% and you have $%. Top up to keep going.',
      to_char(price / 100.0, 'FM999990.00'), to_char(bal / 100.0, 'FM999990.00')
      using hint = 'no_credits';
  end if;

  insert into public.studio_generations (project_id, created_by, tool, model, prompt, params, inputs, cost_cents, price_cents)
  values (p_project, auth.uid(), p_tool, p_model, nullif(trim(p_prompt), ''), coalesce(p_params, '{}'::jsonb), coalesce(p_inputs, '[]'::jsonb), coalesce(p_cost_cents, 0), price)
  returning id into new_id;
  insert into public.credit_ledger (user_id, kind, amount_cents, generation_id, note, created_by)
  values (auth.uid(), 'charge', -price, new_id, left(coalesce(p_params->>'label', p_prompt, p_tool), 300), auth.uid());
  return new_id;
end;
$$;

-- Failed jobs are refunded. Stopped jobs are refunded only if they never reached the provider.
create or replace function public.studio_end_generation(p_id uuid, p_status text, p_error text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare g public.studio_generations;
begin
  if p_status not in ('failed', 'canceled') then raise exception 'Invalid status.'; end if;
  select * into g from public.studio_generations where id = p_id for update;
  if g.id is null or not public.can_edit_project(g.project_id) then raise exception 'Generation not found.'; end if;
  if g.status not in ('queued', 'running') then return; end if;
  update public.studio_generations set status = p_status, error = left(p_error, 1000), finished_at = now() where id = p_id;
  if g.price_cents > 0 and (p_status = 'failed' or g.provider_request_id is null) then
    insert into public.credit_ledger (user_id, kind, amount_cents, generation_id, note, created_by)
    values (g.created_by, 'refund', g.price_cents, g.id, case when p_status = 'failed' then 'Refund: didn’t finish' else 'Refund: stopped before it started' end, auth.uid())
    on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.studio_start_generation(uuid, text, text, text, jsonb, jsonb, integer) to authenticated;
grant execute on function public.studio_end_generation(uuid, text, text) to authenticated;
