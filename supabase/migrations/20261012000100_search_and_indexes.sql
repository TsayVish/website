-- ═════════════════════════════════════════════════════════════════════════
-- Search and speed: full-text search with prefix matching, and indexes for
-- the queries the app runs most. Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

-- array_to_string isn't immutable, so generated columns need this wrapper.
create or replace function public.immutable_join(arr text[])
returns text language sql immutable parallel safe set search_path = ''
as $$ select coalesce(array_to_string(arr, ' '), '') $$;

-- "voi act" → 'voi':* & 'act':*  (each word matches as a prefix; at most 8 words)
create or replace function public.prefix_tsquery(q text)
returns tsquery language sql immutable parallel safe set search_path = ''
as $$
  select case when count(*) = 0 then null
              else to_tsquery('simple', string_agg(w || ':*', ' & ')) end
  from (
    select w from unnest(regexp_split_to_array(
      lower(regexp_replace(coalesce(q, ''), '[^[:alnum:][:space:]]', ' ', 'g')), '\s+')) as w
    where w <> '' limit 8
  ) words
$$;

alter table public.listings add column if not exists search_vector tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(summary, '') || ' ' || coalesce(seller_name, '') || ' '
    || coalesce(category, '') || ' ' || public.immutable_join(categories)), 'B') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'C')) stored;

alter table public.profiles add column if not exists search_vector tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(full_name, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(bio, '') || ' ' || coalesce(location, '')), 'B')) stored;

alter table public.posts add column if not exists search_vector tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(body, '')), 'B')) stored;

create index if not exists listings_search_idx on public.listings using gin (search_vector);
create index if not exists profiles_search_idx on public.profiles using gin (search_vector);
create index if not exists posts_search_idx on public.posts using gin (search_vector);

-- Ranked search. These run with the caller's permissions, so row-level security still applies.
create or replace function public.search_listings(q text)
returns setof public.listings language sql stable set search_path = ''
as $$
  select l.* from public.listings l
  where l.status = 'published' and l.search_vector @@ public.prefix_tsquery(q)
  order by ts_rank(l.search_vector, public.prefix_tsquery(q)) desc, l.created_at desc
$$;

create or replace function public.search_profiles(q text)
returns setof public.profiles language sql stable set search_path = ''
as $$
  select p.* from public.profiles p
  where p.discoverable and p.id is distinct from auth.uid()
    and p.search_vector @@ public.prefix_tsquery(q)
  order by ts_rank(p.search_vector, public.prefix_tsquery(q)) desc, p.created_at desc
$$;

create or replace function public.search_posts(q text)
returns setof public.posts language sql stable set search_path = ''
as $$
  select p.* from public.posts p
  where p.status = 'published' and p.search_vector @@ public.prefix_tsquery(q)
  order by ts_rank(p.search_vector, public.prefix_tsquery(q)) desc, p.published_at desc
$$;

grant execute on function public.search_listings(text), public.search_profiles(text), public.search_posts(text)
  to anon, authenticated;

-- Indexes for common lookups.
create index if not exists listings_categories_idx on public.listings using gin (categories);
create index if not exists listings_project_idx on public.listings (project_id) where project_id is not null;
create index if not exists follows_follower_idx on public.follows (follower_id);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);
create index if not exists posts_owner_status_idx on public.posts (owner_id, status, published_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists project_services_status_idx on public.project_services (status, updated_at desc);
create index if not exists offers_listing_status_idx on public.offers (listing_id, status);
