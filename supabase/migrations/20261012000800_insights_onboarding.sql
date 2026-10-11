-- ═════════════════════════════════════════════════════════════════════════
-- Onboarding, listing and profile views, sales insights, and ranked Discover.
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists onboarded_at timestamptz;
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_interests_check;
alter table public.profiles add constraint profiles_interests_check check (cardinality(interests) <= 12);
-- People who joined before onboarding existed skip it.
update public.profiles set onboarded_at = created_at where onboarded_at is null and created_at < timestamptz '2026-10-12';

-- ── Views: one per viewer per item per day ──
create table if not exists public.listing_views (
  listing_id uuid not null references public.listings (id) on delete cascade,
  viewer_id  uuid not null references auth.users (id) on delete cascade,
  day        date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (listing_id, viewer_id, day)
);
create index if not exists listing_views_day_idx on public.listing_views (listing_id, day);
create table if not exists public.profile_views (
  profile_id uuid not null references auth.users (id) on delete cascade,
  viewer_id  uuid not null references auth.users (id) on delete cascade,
  day        date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (profile_id, viewer_id, day)
);
alter table public.listing_views enable row level security;
alter table public.profile_views enable row level security;
revoke insert, update, delete on public.listing_views, public.profile_views from anon, authenticated;
drop policy if exists "Listing views: owner reads" on public.listing_views;
create policy "Listing views: owner reads" on public.listing_views for select to authenticated using (
  exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));
drop policy if exists "Profile views: owner reads" on public.profile_views;
create policy "Profile views: owner reads" on public.profile_views for select to authenticated using (profile_id = (select auth.uid()));

create or replace function public.log_view(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  if p_kind = 'listing' then
    insert into public.listing_views (listing_id, viewer_id)
    select p_id, auth.uid() from public.listings where id = p_id and owner_id <> auth.uid() and status = 'published'
    on conflict do nothing;
  elsif p_kind = 'profile' and p_id <> auth.uid() then
    insert into public.profile_views (profile_id, viewer_id) values (p_id, auth.uid()) on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.log_view(text, uuid) from public, anon;
grant execute on function public.log_view(text, uuid) to authenticated;

-- Daily totals for the signed-in creator, for Insights.
create or replace function public.my_daily_stats(since date)
returns table (day date, listing_views integer, profile_views integer, sales numeric, followers integer)
language sql stable security definer set search_path = ''
as $$
  with days as (select generate_series(since, current_date, interval '1 day')::date as day)
  select d.day,
    (select count(*)::int from public.listing_views v join public.listings l on l.id = v.listing_id
       where l.owner_id = auth.uid() and v.day = d.day),
    (select count(*)::int from public.profile_views v where v.profile_id = auth.uid() and v.day = d.day),
    (select coalesce(sum(o.amount), 0) from public.offers o
       where o.seller_id = auth.uid() and o.status = 'accepted' and o.responded_at::date = d.day),
    (select count(*)::int from public.follows f where f.creator_id = auth.uid() and f.created_at::date = d.day)
  from days d order by d.day
$$;
revoke all on function public.my_daily_stats(date) from public, anon;
grant execute on function public.my_daily_stats(date) to authenticated;

-- ── Ranked Discover ──
-- Listings: recent views and offers count, with a boost for new listings and the viewer's interests.
create or replace function public.discover_listings(p_topic text default null, p_limit integer default 16)
returns setof public.listings language sql stable security definer set search_path = ''
as $$
  select l.* from public.listings l
  left join lateral (select count(*) as n from public.listing_views v where v.listing_id = l.id and v.day > current_date - 14) views on true
  left join lateral (select count(*) as n from public.offers o where o.listing_id = l.id and o.created_at > now() - interval '30 days') offers on true
  where l.status = 'published'
    and (p_topic is null or l.categories @> array[p_topic])
    and not exists (select 1 from public.bans b where b.user_id = l.owner_id)
  order by
    ln(1 + views.n) + 2 * ln(1 + offers.n)
    + 3 * exp(-extract(epoch from now() - l.created_at) / 604800.0)
    + case when exists (select 1 from public.profiles p where p.id = auth.uid() and p.interests && l.categories) then 1 else 0 end
    desc, l.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;
grant execute on function public.discover_listings(text, integer) to anon, authenticated;

-- Creators: followers, a complete profile and recent activity.
create or replace function public.discover_creators(p_limit integer default 9)
returns table (id uuid, full_name text, avatar_url text, bio text, location text, website text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, p.avatar_url, p.bio, p.location, p.website
  from public.profiles p
  where p.discoverable and p.full_name is not null and p.id is distinct from auth.uid()
    and not exists (select 1 from public.bans b where b.user_id = p.id)
  order by
    ln(1 + (select count(*) from public.follows f where f.creator_id = p.id))
    + case when p.avatar_url is not null then 0.5 else 0 end
    + case when p.bio is not null then 0.5 else 0 end
    + case when exists (select 1 from public.listings l where l.owner_id = p.id and l.status = 'published') then 1 else 0 end
    + 2 * exp(-extract(epoch from now() - p.created_at) / 1209600.0)
    desc
  limit least(greatest(p_limit, 1), 50)
$$;
grant execute on function public.discover_creators(integer) to authenticated;
