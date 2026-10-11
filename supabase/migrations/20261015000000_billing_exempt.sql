-- ═════════════════════════════════════════════════════════════════════════
-- Billing off for chosen members: their AI Studio jobs don't use credits.
-- The provider cost is still recorded (Admin → Billing), and any staff-set
-- monthly spend cap still applies. Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.billing_exempt (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.billing_exempt enable row level security;
drop policy if exists "Billing exempt: own or staff" on public.billing_exempt;
create policy "Billing exempt: own or staff" on public.billing_exempt for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());
revoke insert, update, delete on public.billing_exempt from anon, authenticated;

create or replace function public.is_billing_exempt(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.billing_exempt where user_id = uid) and (uid = auth.uid() or public.is_staff()) $$;
grant execute on function public.is_billing_exempt(uuid) to authenticated;

create or replace function public.admin_set_billing_exempt(p_user uuid, p_exempt boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  if p_exempt then
    insert into public.billing_exempt (user_id, note, created_by) values (p_user, nullif(left(trim(coalesce(p_note, '')), 300), ''), auth.uid())
    on conflict (user_id) do update set note = excluded.note, created_by = excluded.created_by, created_at = now();
  else
    delete from public.billing_exempt where user_id = p_user;
  end if;
  perform public.log_admin_action(case when p_exempt then 'billing_off' else 'billing_on' end, 'user', p_user::text, jsonb_build_object('note', p_note));
end;
$$;
grant execute on function public.admin_set_billing_exempt(uuid, boolean, text) to authenticated;

-- Generation: free for exempt members, otherwise charged as before.
create or replace function public.studio_start_generation(
  p_project uuid, p_tool text, p_model text, p_prompt text, p_params jsonb, p_inputs jsonb, p_cost_cents integer)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare used integer; cap integer; new_id uuid; price integer; bal integer; free boolean;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  if not public.can_edit_project(p_project) then raise exception 'You can only generate for characters you can edit.'; end if;
  if coalesce(p_cost_cents, 0) < 0 then raise exception 'Invalid cost.'; end if;

  perform pg_advisory_xact_lock(hashtext('credits:' || auth.uid()::text));

  select l.monthly_cents into cap from public.studio_limits l where l.user_id = auth.uid();
  if cap is not null then
    select u.used_cents into used from public.studio_usage(auth.uid()) u;
    if used + coalesce(p_cost_cents, 0) > cap then
      raise exception 'You’ve reached the monthly AI Studio limit on your account. Contact the tsayvish team.' using hint = 'over_limit';
    end if;
  end if;

  free := exists (select 1 from public.billing_exempt where user_id = auth.uid());
  price := case when free then 0 else public.credit_price(coalesce(p_cost_cents, 0)) end;
  if not free then
    bal := public.credit_balance(auth.uid());
    if bal < price then
      raise exception 'Not enough credits: this costs $% and you have $%. Top up to keep going.',
        to_char(price / 100.0, 'FM999990.00'), to_char(bal / 100.0, 'FM999990.00')
        using hint = 'no_credits';
    end if;
  end if;

  insert into public.studio_generations (project_id, created_by, tool, model, prompt, params, inputs, cost_cents, price_cents)
  values (p_project, auth.uid(), p_tool, p_model, nullif(trim(p_prompt), ''), coalesce(p_params, '{}'::jsonb), coalesce(p_inputs, '[]'::jsonb), coalesce(p_cost_cents, 0), price)
  returning id into new_id;
  if price > 0 then
    insert into public.credit_ledger (user_id, kind, amount_cents, generation_id, note, created_by)
    values (auth.uid(), 'charge', -price, new_id, left(coalesce(p_params->>'label', p_prompt, p_tool), 300), auth.uid());
  end if;
  return new_id;
end;
$$;
grant execute on function public.studio_start_generation(uuid, text, text, text, jsonb, jsonb, integer) to authenticated;
