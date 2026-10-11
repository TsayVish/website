-- ═════════════════════════════════════════════════════════════════════════
-- License agreements: an accepted offer gets written terms both sides accept.
-- (Click-to-accept with a typed name. Swap in an e-signature provider later.)
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.agreements (
  offer_id           uuid primary key references public.offers (id) on delete cascade,
  terms              jsonb not null default '{}' check (pg_column_size(terms) <= 30000),
  version            integer not null default 1,
  status             text not null default 'proposed' check (status in ('proposed', 'signed')),
  seller_accepted_at timestamptz,
  seller_signature   text check (seller_signature is null or char_length(seller_signature) <= 120),
  buyer_accepted_at  timestamptz,
  buyer_signature    text check (buyer_signature is null or char_length(buyer_signature) <= 120),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.agreements enable row level security;
revoke insert, update, delete on public.agreements from anon, authenticated;
drop policy if exists "Agreements: parties read" on public.agreements;
create policy "Agreements: parties read" on public.agreements for select to authenticated using (
  public.is_staff() or exists (select 1 from public.offers o where o.id = offer_id
    and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid()))));

-- The seller writes (or revises) the terms. Any revision clears both acceptances.
create or replace function public.propose_agreement(p_offer uuid, p_terms jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.offers where id = p_offer;
  if o.id is null or o.seller_id <> auth.uid() then raise exception 'Only the seller can write the agreement'; end if;
  if o.status <> 'accepted' then raise exception 'The offer must be accepted first'; end if;
  if exists (select 1 from public.agreements where offer_id = p_offer and status = 'signed') then
    raise exception 'This agreement is already signed';
  end if;
  insert into public.agreements (offer_id, terms) values (p_offer, p_terms)
  on conflict (offer_id) do update set terms = excluded.terms, version = public.agreements.version + 1,
    status = 'proposed', seller_accepted_at = null, seller_signature = null,
    buyer_accepted_at = null, buyer_signature = null, updated_at = now();
  insert into public.notifications (user_id, type, actor_id, offer_id, listing_id)
  values (o.buyer_id, 'agreement_proposed', o.seller_id, o.id, o.listing_id);
end;
$$;

-- Either side accepts by typing their name. When both have, it's signed.
create or replace function public.accept_agreement(p_offer uuid, p_signature text, p_version integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare o record; a record; sig text := btrim(coalesce(p_signature, ''));
begin
  select * into o from public.offers where id = p_offer;
  select * into a from public.agreements where offer_id = p_offer for update;
  if o.id is null or a.offer_id is null then raise exception 'Agreement not found'; end if;
  if auth.uid() not in (o.buyer_id, o.seller_id) then raise exception 'Only the buyer or seller can accept'; end if;
  if a.status = 'signed' then raise exception 'Already signed'; end if;
  if a.version <> p_version then raise exception 'The terms changed. Review the latest version.'; end if;
  if char_length(sig) < 2 then raise exception 'Type your full name to accept'; end if;
  if auth.uid() = o.seller_id then
    update public.agreements set seller_accepted_at = now(), seller_signature = sig, updated_at = now() where offer_id = p_offer;
  else
    update public.agreements set buyer_accepted_at = now(), buyer_signature = sig, updated_at = now() where offer_id = p_offer;
  end if;
  select * into a from public.agreements where offer_id = p_offer;
  if a.seller_accepted_at is not null and a.buyer_accepted_at is not null then
    update public.agreements set status = 'signed', updated_at = now() where offer_id = p_offer;
    insert into public.notifications (user_id, type, actor_id, offer_id, listing_id)
    values (case when auth.uid() = o.seller_id then o.buyer_id else o.seller_id end, 'agreement_signed', auth.uid(), o.id, o.listing_id);
  end if;
end;
$$;

revoke all on function public.propose_agreement(uuid, jsonb), public.accept_agreement(uuid, text, integer) from public, anon;
grant execute on function public.propose_agreement(uuid, jsonb), public.accept_agreement(uuid, text, integer) to authenticated;
